import { createNodeDescriptor, INodeFunctionBaseParams } from "@cognigy/extension-tools";
import axios from "axios";

const BASE_URL = "https://cxone.niceincontact.com";

interface ICxoneAuthCache {
	token?: string;
	tokenEndpoint?: string;
	tenantId?: string;
	apiBaseUrl?: string;
}

export interface IGetTokenParams extends INodeFunctionBaseParams {
	config: {
		authConnection: {
			clientId: string;
			clientSecret: string;
			cxoneUsername: string;
			cxonePassword: string;
		};
		storageType: "context" | "input";
		storageKey: string;
	};
}

function decodeJWT(token: string): any {
	const parts = token.split(".");
	if (parts.length !== 3) {
		throw new Error("Invalid JWT format");
	}
	return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
}

function isTokenExpired(decoded: any): boolean {
	if (!decoded.exp) return true;
	// 60-second buffer for clock skew
	return decoded.exp < Math.floor(Date.now() / 1000) + 60;
}

export const getToken = createNodeDescriptor({
	type: "getToken",
	defaultLabel: "Get Token",
	summary: "Authenticate with CXone and cache the token, tenant ID, and API base URL",
	fields: [
		{
			key: "authConnection",
			label: "CXone Auth",
			type: "connection",
			params: {
				connectionType: "cxone-auth",
				required: true
			}
		},
		{
			key: "storageType",
			label: "Store In",
			type: "select",
			defaultValue: "context",
			params: {
				options: [
					{ label: "Context", value: "context" },
					{ label: "Input", value: "input" }
				],
				required: true
			}
		},
		{
			key: "storageKey",
			label: "Storage Key",
			type: "cognigyText",
			defaultValue: "cxoneToken",
			params: {
				required: true
			},
			description: "Key under which the auth cache object is stored. Contains: token, tenantId, apiBaseUrl, tokenEndpoint."
		}
	],
	sections: [
		{
			key: "auth",
			label: "Authentication",
			defaultCollapsed: false,
			fields: ["authConnection"]
		},
		{
			key: "storage",
			label: "Storage",
			defaultCollapsed: false,
			fields: ["storageType", "storageKey"]
		}
	],
	form: [
		{ type: "section", key: "auth" },
		{ type: "section", key: "storage" }
	],
	preview: {
		type: "text",
		key: "storageKey"
	},
	function: async ({ cognigy, config }: IGetTokenParams) => {
		const { api, context, input } = cognigy;
		const { authConnection, storageType, storageKey } = config;

		// Retrieve existing cache from whichever store we're targeting
		const store = storageType === "context" ? context : input;
		const cache: ICxoneAuthCache = (store[storageKey] as ICxoneAuthCache) || {};

		// --- Step 1: Validate cached token ---
		let needNewToken = true;
		if (cache.token) {
			try {
				const decoded = decodeJWT(cache.token);
				if (!isTokenExpired(decoded)) {
					api.log("info", "CXone: cached token is valid, skipping auth");
					needNewToken = false;
				} else {
					api.log("info", "CXone: cached token expired, re-authenticating");
					cache.token = undefined;
				}
			} catch (err: any) {
				api.log("warn", `CXone: token validation failed — ${err.message}`);
				cache.token = undefined;
			}
		}

		if (needNewToken) {
			// --- Step 2: OpenID discovery (skip if cached) ---
			if (!cache.tokenEndpoint) {
				api.log("info", "CXone: fetching OpenID configuration");
				const openidResponse = await axios.get(`${BASE_URL}/.well-known/openid-configuration`);

				if (!openidResponse.data?.token_endpoint) {
					throw new Error("CXone: token_endpoint missing from OpenID configuration");
				}

				cache.tokenEndpoint = openidResponse.data.token_endpoint;
				api.log("info", `CXone: token endpoint — ${cache.tokenEndpoint}`);
			}

			// --- Step 3: Token grant ---
			api.log("info", "CXone: requesting access token");

			const basicAuth = Buffer.from(
				`${authConnection.clientId}:${authConnection.clientSecret}`
			).toString("base64");

			const body = new URLSearchParams();
			body.append("grant_type", "password");
			body.append("username", authConnection.cxoneUsername);
			body.append("password", authConnection.cxonePassword);

			const tokenResponse = await axios.post(cache.tokenEndpoint, body.toString(), {
				headers: {
					Authorization: `Basic ${basicAuth}`,
					"Content-Type": "application/x-www-form-urlencoded"
				}
			});

			if (!tokenResponse.data?.access_token) {
				throw new Error("CXone: access_token missing from token response");
			}

			cache.token = tokenResponse.data.access_token;
			api.log("info", "CXone: access token retrieved");

			// --- Step 4: Extract tenant ID from JWT ---
			const decoded = decodeJWT(cache.token);
			cache.tenantId = decoded.tenantId;
			api.log("info", `CXone: tenant ID — ${cache.tenantId}`);
		}

		// --- Step 5: API base URL discovery (skip if cached) ---
		if (!cache.apiBaseUrl) {
			if (!cache.tenantId) {
				throw new Error("CXone: tenant ID unavailable — cannot perform API discovery");
			}
			api.log("info", "CXone: fetching API base URL from discovery service");
			const discoveryResponse = await axios.get(
				`${BASE_URL}/.well-known/cxone-configuration?tenantId=${cache.tenantId}`
			);

			if (!discoveryResponse.data?.api_endpoint) {
				throw new Error("CXone: api_endpoint missing from discovery response");
			}

			cache.apiBaseUrl = discoveryResponse.data.api_endpoint;
			api.log("info", `CXone: API base URL — ${cache.apiBaseUrl}`);
		}

		// --- Store updated cache ---
		if (storageType === "context") {
			context[storageKey] = cache;
		} else {
			// @ts-ignore
			api.addToInput(storageKey, cache);
		}
	}
});
