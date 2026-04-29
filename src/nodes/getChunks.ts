import { createNodeDescriptor, INodeFunctionBaseParams } from "@cognigy/extension-tools";
import axios from "axios";
import { ensureCxoneAuth, ICxoneAuthCache } from "../utils/cxoneAuth";

const RETRIEVAL_PATH = "/eai-knowledge-hub-services/retrieval-service/v1/retrieve";

interface ICleanChunk {
	title: string;
	content: string;
	relevance_percent: string;
}

interface ICleanOutput {
	success: boolean;
	message: string;
	content: ICleanChunk[];
}

export interface IGetChunksParams extends INodeFunctionBaseParams {
	config: {
		// Auth
		authMode: "cache" | "inline";
		authConnection?: {
			clientId: string;
			clientSecret: string;
			cxoneUsername: string;
			cxonePassword: string;
		};
		cacheStorageType: "context" | "input";
		cacheKey: string;
		// Query
		knowledgehubId: string;
		queryText: string;
		numberOfResults: number;
		filter?: object;
		// Raw storage
		storageType: "context" | "input";
		storageKey: string;
		// Clean output
		cleanOutput: boolean;
		cleanStorageType: "context" | "input";
		cleanStorageKey: string;
	};
}

export const getChunks = createNodeDescriptor({
	type: "getChunks",
	defaultLabel: "Get Chunks",
	summary: "Retrieve knowledge chunks from the CXone Knowledge Hub retrieval service",
	tags: ["service"],
	fields: [
		// --- Auth mode ---
		{
			key: "authMode",
			label: "Auth Mode",
			type: "select",
			defaultValue: "cache",
			params: {
				options: [
					{ label: "Use Token Cache", value: "cache" },
					{ label: "Authenticate Inline", value: "inline" }
				],
				required: true
			},
			description: "Use a cached token from the Get Token node, or authenticate inline before querying"
		},
		{
			key: "authConnection",
			label: "CXone Auth",
			type: "connection",
			condition: { key: "authMode", value: "inline" },
			params: {
				connectionType: "cxone-auth",
				required: true
			}
		},
		{
			key: "cacheStorageType",
			label: "Token Cache Location",
			type: "select",
			defaultValue: "context",
			params: {
				options: [
					{ label: "Context", value: "context" },
					{ label: "Input", value: "input" }
				],
				required: true
			},
			description: "Where to read (cache mode) or read/write (inline mode) the auth cache"
		},
		{
			key: "cacheKey",
			label: "Token Cache Key",
			type: "cognigyText",
			defaultValue: "cxoneToken",
			params: { required: true }
		},
		// --- Query ---
		{
			key: "knowledgehubId",
			label: "Knowledge Hub ID",
			type: "cognigyText",
			params: { required: true }
		},
		{
			key: "queryText",
			label: "Query Text",
			type: "cognigyText",
			params: { required: true }
		},
		{
			key: "numberOfResults",
			label: "Number of Results",
			type: "number",
			defaultValue: 5,
			params: { required: true }
		},
		// --- Filter ---
		{
			key: "filter",
			label: "Filter",
			type: "json",
			description: "Optional filter object. Supports operators: equals, notEquals, greaterThan, greaterThanOrEquals, lessThan, lessThanOrEquals, in, notIn, startsWith. Combine with andAll / orAll arrays."
		},
		// --- Raw storage ---
		{
			key: "storageType",
			label: "Store Results In",
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
			defaultValue: "chunks",
			params: { required: true }
		},
		// --- Clean output ---
		{
			key: "cleanOutput",
			label: "Also Write Clean Output",
			type: "toggle",
			defaultValue: false,
			description: "Maps results to { title, content, relevance_percent } and writes to a separate key"
		},
		{
			key: "cleanStorageType",
			label: "Clean Output Location",
			type: "select",
			defaultValue: "context",
			condition: { key: "cleanOutput", value: true },
			params: {
				options: [
					{ label: "Context", value: "context" },
					{ label: "Input", value: "input" }
				],
				required: true
			}
		},
		{
			key: "cleanStorageKey",
			label: "Clean Output Key",
			type: "cognigyText",
			defaultValue: "chunksClean",
			condition: { key: "cleanOutput", value: true },
			params: { required: true }
		}
	],
	sections: [
		{
			key: "authSection",
			label: "Authentication",
			defaultCollapsed: false,
			fields: ["authMode", "authConnection", "cacheStorageType", "cacheKey"]
		},
		{
			key: "query",
			label: "Query",
			defaultCollapsed: false,
			fields: ["knowledgehubId", "queryText", "numberOfResults"]
		},
		{
			key: "filterSection",
			label: "Filter",
			defaultCollapsed: true,
			fields: ["filter"]
		},
		{
			key: "storage",
			label: "Storage",
			defaultCollapsed: false,
			fields: ["storageType", "storageKey", "cleanOutput", "cleanStorageType", "cleanStorageKey"]
		}
	],
	form: [
		{ type: "section", key: "authSection" },
		{ type: "section", key: "query" },
		{ type: "section", key: "filterSection" },
		{ type: "section", key: "storage" }
	],
	preview: {
		type: "text",
		key: "queryText"
	},
	function: async ({ cognigy, config }: IGetChunksParams) => {
		const { api, context, input } = cognigy;
		const {
			authMode,
			authConnection,
			cacheStorageType,
			cacheKey,
			knowledgehubId,
			queryText,
			numberOfResults,
			filter,
			storageType,
			storageKey,
			cleanOutput,
			cleanStorageType,
			cleanStorageKey
		} = config;

		const log = (msg: string) => api.log("info", `CXone Get Chunks: ${msg}`);

		// Resolve auth cache
		const cacheStore = cacheStorageType === "context" ? context : input;
		const cache: ICxoneAuthCache = (cacheStore[cacheKey] as ICxoneAuthCache) || {};

		if (authMode === "inline") {
			if (!authConnection) {
				throw new Error("CXone Get Chunks: inline auth mode requires a CXone Auth connection");
			}
			await ensureCxoneAuth(cache, authConnection, log);

			// Write updated cache back
			if (cacheStorageType === "context") {
				context[cacheKey] = cache;
			} else {
				// @ts-ignore
				api.addToInput(cacheKey, cache);
			}
		} else {
			// Cache mode — validate what we have
			if (!cache.token) {
				throw new Error("CXone Get Chunks: no valid auth token in cache — run Get Token node first, or switch to Authenticate Inline mode");
			}
			if (!cache.apiBaseUrl) {
				throw new Error("CXone Get Chunks: apiBaseUrl missing from auth cache");
			}
			if (!cache.tenantId) {
				throw new Error("CXone Get Chunks: tenantId missing from auth cache");
			}
		}

		// Build and send request
		const payload: Record<string, any> = {
			knowledgehubId,
			meta: { tenantId: cache.tenantId },
			query: { queryText },
			queryConfig: { numberOfResults }
		};

		if (filter && Object.keys(filter).length > 0) {
			payload.queryConfig.filter = filter;
		}

		log(`querying "${queryText}" against hub ${knowledgehubId}`);

		const response = await axios.post(`${cache.apiBaseUrl}${RETRIEVAL_PATH}`, payload, {
			headers: {
				Authorization: `Bearer ${cache.token}`,
				"Content-Type": "application/json",
				Accept: "application/json"
			}
		});

		const results = response.data;
		log("received response");

		// Write raw results
		if (storageType === "context") {
			context[storageKey] = results;
		} else {
			// @ts-ignore
			api.addToInput(storageKey, results);
		}

		// Write clean output if toggled
		if (cleanOutput) {
			const chunks: ICleanChunk[] = (results?.results ?? []).map((chunk: any) => ({
				title: chunk?.metadata?.Title ?? "",
				content: chunk?.content?.text ?? "",
				relevance_percent: `${Math.round((chunk?.score ?? 0) * 100)}%`
			}));

			const clean: ICleanOutput = {
				success: chunks.length > 0,
				message: chunks.length > 0 ? `${chunks.length} articles found` : "No relevant content found",
				content: chunks
			};

			if (cleanStorageType === "context") {
				context[cleanStorageKey] = clean;
			} else {
				// @ts-ignore
				api.addToInput(cleanStorageKey, clean);
			}

			log(`wrote clean output to ${cleanStorageType}.${cleanStorageKey} — ${clean.message}`);
		}
	}
});
