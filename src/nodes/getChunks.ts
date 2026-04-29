import { createNodeDescriptor, INodeFunctionBaseParams } from "@cognigy/extension-tools";
import axios from "axios";

const RETRIEVAL_PATH = "/eai-knowledge-hub-services/retrieval-service/v1/retrieve";

interface ICxoneAuthCache {
	token?: string;
	tenantId?: string;
	apiBaseUrl?: string;
}

export interface IGetChunksParams extends INodeFunctionBaseParams {
	config: {
		// Auth cache location (written by getToken node)
		cacheStorageType: "context" | "input";
		cacheKey: string;
		// Query
		knowledgehubId: string;
		queryText: string;
		numberOfResults: number;
		// Optional filter (raw JSON object)
		filter?: object;
		// Result storage
		storageType: "context" | "input";
		storageKey: string;
	};
}

export const getChunks = createNodeDescriptor({
	type: "getChunks",
	defaultLabel: "Get Chunks",
	summary: "Retrieve knowledge chunks from the CXone Knowledge Hub retrieval service",
	fields: [
		// --- Auth cache ---
		{
			key: "cacheStorageType",
			label: "Auth Cache Location",
			type: "select",
			defaultValue: "context",
			params: {
				options: [
					{ label: "Context", value: "context" },
					{ label: "Input", value: "input" }
				],
				required: true
			},
			description: "Where the CXone auth cache was stored by the Get Token node"
		},
		{
			key: "cacheKey",
			label: "Auth Cache Key",
			type: "cognigyText",
			defaultValue: "cxoneToken",
			params: { required: true },
			description: "Key used by the Get Token node to store the auth cache"
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
		// --- Result storage ---
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
		}
	],
	sections: [
		{
			key: "authCache",
			label: "Auth Cache",
			defaultCollapsed: false,
			fields: ["cacheStorageType", "cacheKey"]
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
			fields: ["storageType", "storageKey"]
		}
	],
	form: [
		{ type: "section", key: "authCache" },
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
			cacheStorageType,
			cacheKey,
			knowledgehubId,
			queryText,
			numberOfResults,
			filter,
			storageType,
			storageKey
		} = config;

		// Read auth cache from whichever store getToken wrote to
		const cacheStore = cacheStorageType === "context" ? context : input;
		const cache = cacheStore[cacheKey] as ICxoneAuthCache | undefined;

		if (!cache?.token) {
			throw new Error("CXone Get Chunks: no valid auth token found — run Get Token node first");
		}
		if (!cache.apiBaseUrl) {
			throw new Error("CXone Get Chunks: apiBaseUrl missing from auth cache — run Get Token node first");
		}
		if (!cache.tenantId) {
			throw new Error("CXone Get Chunks: tenantId missing from auth cache — run Get Token node first");
		}

		const url = `${cache.apiBaseUrl}${RETRIEVAL_PATH}`;

		const payload: Record<string, any> = {
			knowledgehubId,
			meta: {
				tenantId: cache.tenantId
			},
			query: {
				queryText
			},
			queryConfig: {
				numberOfResults
			}
		};

		if (filter && Object.keys(filter).length > 0) {
			payload.queryConfig.filter = filter;
		}

		api.log("info", `CXone Get Chunks: querying "${queryText}" against hub ${knowledgehubId}`);

		const response = await axios.post(url, payload, {
			headers: {
				Authorization: `Bearer ${cache.token}`,
				"Content-Type": "application/json",
				Accept: "application/json"
			}
		});

		const results = response.data;
		api.log("info", `CXone Get Chunks: received response`);

		if (storageType === "context") {
			context[storageKey] = results;
		} else {
			// @ts-ignore
			api.addToInput(storageKey, results);
		}
	}
});
