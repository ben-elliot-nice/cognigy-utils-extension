import { createNodeDescriptor, INodeFunctionBaseParams } from "@cognigy/extension-tools";
import axios from "axios";

const RETRIEVAL_PATH = "/eai-knowledge-hub-services/retrieval-service/v1/retrieve";

interface ICxoneAuthCache {
	token?: string;
	tenantId?: string;
	apiBaseUrl?: string;
}

export interface IKnowledgeToolParams extends INodeFunctionBaseParams {
	config: {
		// Tool identity (used by the AI agent to select and call this tool)
		toolId: string;
		description: string;
		// Parameters schema — defines what the agent passes at runtime
		parameters: object;
		// Auth cache
		cacheStorageType: "context" | "input";
		cacheKey: string;
		// Knowledge Hub
		knowledgehubId: string;
		// The query text — typically a CognigyScript reference to the agent's tool call param
		queryText: string;
		numberOfResults: number;
		filter?: object;
		// Storage
		storeLocation: "none" | "context" | "input";
		storeLocationContextKey: string;
		storeLocationInputKey: string;
		// Debug
		debugMessage: boolean;
	};
}

export const knowledgeTool = createNodeDescriptor({
	type: "knowledgeTool",
	defaultLabel: "CX1 Knowledge Tool",
	summary: "Retrieve knowledge chunks from CXone Knowledge Hub as an AI agent tool",

	// Must match the built-in to slot into aiAgentJob correctly
	appearance: {
		color: "white",
		textColor: "#252525",
		showIcon: true,
		variant: "mini"
	},

	behavior: {
		// stopping: true is critical — tells the platform this node hands back to the agent
		stopping: true,
		entrypoint: false
	},

	// Declare valid parents — matches the built-in whitelist entries
	// @ts-ignore — parentType accepts string | string[] at runtime even if typings say string
	parentType: ["aiAgentJob", "llmPromptV2"],

	constraints: {
		editable: true,
		deletable: true,
		creatable: true,
		collapsable: true,
		childFlowCreatable: false,
		movable: true,
		placement: {
			predecessor: {
				whitelist: [] // empty = no predecessor allowed; attaches directly under parent
			},
			successor: {},
			children: {
				whitelist: []
			}
		}
	},

	fields: [
		// --- Tool identity ---
		{
			key: "toolId",
			label: "Tool ID",
			type: "cognigyText",
			defaultValue: "retrieve_knowledge",
			params: { required: true },
			description: "Unique identifier the AI agent uses to call this tool. No spaces — use underscores."
		},
		{
			key: "description",
			label: "Description",
			type: "cognigyText",
			defaultValue: "Search the CXone Knowledge Hub and return relevant knowledge chunks for the user's query.",
			params: { required: true },
			description: "Tells the AI agent what this tool does and when to use it."
		},
		{
			key: "parameters",
			label: "Tool Parameters Schema",
			type: "json",
			defaultValue: {
				type: "object",
				properties: {
					generated_prompt: {
						type: "string",
						description: "The user's query or question to search the knowledge base with."
					}
				},
				required: ["generated_prompt"],
				additionalProperties: false
			},
			description: "JSON Schema defining the parameters the AI agent will pass when calling this tool."
		},
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
			description: "Where the Get Token node stored the auth cache"
		},
		{
			key: "cacheKey",
			label: "Auth Cache Key",
			type: "cognigyText",
			defaultValue: "cxoneToken",
			params: { required: true }
		},
		// --- Knowledge Hub ---
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
			defaultValue: "{{input.data.toolInput.generated_prompt}}",
			params: { required: true },
			description: "The search query — typically a CognigyScript reference to the agent's tool call parameter."
		},
		{
			key: "numberOfResults",
			label: "Number of Results",
			type: "slider",
			defaultValue: 5,
			params: {
				min: 1,
				max: 10
			}
		},
		{
			key: "filter",
			label: "Filter",
			type: "json",
			description: "Optional filter. Supports: equals, notEquals, greaterThan, greaterThanOrEquals, lessThan, lessThanOrEquals, in, notIn, startsWith. Combine with andAll / orAll."
		},
		// --- Storage ---
		{
			key: "storeLocation",
			label: "Store Results In",
			type: "select",
			defaultValue: "none",
			params: {
				options: [
					{ label: "Don't store", value: "none" },
					{ label: "Context", value: "context" },
					{ label: "Input", value: "input" }
				]
			}
		},
		{
			key: "storeLocationContextKey",
			label: "Context Key",
			type: "cognigyText",
			defaultValue: "knowledgeChunks",
			condition: { key: "storeLocation", value: "context" }
		},
		{
			key: "storeLocationInputKey",
			label: "Input Key",
			type: "cognigyText",
			defaultValue: "knowledgeChunks",
			condition: { key: "storeLocation", value: "input" }
		},
		// --- Debug ---
		{
			key: "debugMessage",
			label: "Debug Message",
			type: "toggle",
			defaultValue: true,
			description: "Log debug information during execution"
		}
	],

	sections: [
		{
			key: "toolIdentity",
			label: "Tool",
			defaultCollapsed: false,
			fields: ["toolId", "description", "parameters"]
		},
		{
			key: "authCache",
			label: "Auth Cache",
			defaultCollapsed: false,
			fields: ["cacheStorageType", "cacheKey"]
		},
		{
			key: "knowledgeHub",
			label: "Knowledge Hub",
			defaultCollapsed: false,
			fields: ["knowledgehubId", "queryText"]
		},
		{
			key: "filterSection",
			label: "Filter",
			defaultCollapsed: true,
			fields: ["filter"]
		},
		{
			key: "advanced",
			label: "Advanced",
			defaultCollapsed: true,
			fields: ["numberOfResults", "storeLocation", "storeLocationContextKey", "storeLocationInputKey"]
		},
		{
			key: "debugging",
			label: "Debugging",
			defaultCollapsed: true,
			fields: ["debugMessage"]
		}
	],

	form: [
		{ type: "section", key: "toolIdentity" },
		{ type: "section", key: "authCache" },
		{ type: "section", key: "knowledgeHub" },
		{ type: "section", key: "filterSection" },
		{ type: "section", key: "advanced" },
		{ type: "section", key: "debugging" }
	],

	preview: {
		type: "text",
		key: "toolId"
	},

	function: async ({ cognigy, config }: IKnowledgeToolParams) => {
		const { api, context, input } = cognigy;
		const {
			cacheStorageType,
			cacheKey,
			knowledgehubId,
			queryText,
			numberOfResults,
			filter,
			storeLocation,
			storeLocationContextKey,
			storeLocationInputKey,
			debugMessage
		} = config;

		const log = (msg: string) => { if (debugMessage) api.log("info", `[knowledgeTool] ${msg}`); };

		// Read auth cache
		const cacheStore = cacheStorageType === "context" ? context : input;
		const cache = cacheStore[cacheKey] as ICxoneAuthCache | undefined;

		if (!cache?.token) {
			throw new Error("knowledgeTool: no valid auth token in cache — run Get Token node before this tool");
		}
		if (!cache.apiBaseUrl) {
			throw new Error("knowledgeTool: apiBaseUrl missing from auth cache");
		}
		if (!cache.tenantId) {
			throw new Error("knowledgeTool: tenantId missing from auth cache");
		}

		log(`querying "${queryText}" against hub ${knowledgehubId}`);

		const payload: Record<string, any> = {
			knowledgehubId,
			meta: { tenantId: cache.tenantId },
			query: { queryText },
			queryConfig: { numberOfResults }
		};

		if (filter && Object.keys(filter).length > 0) {
			payload.queryConfig.filter = filter;
		}

		const response = await axios.post(
			`${cache.apiBaseUrl}${RETRIEVAL_PATH}`,
			payload,
			{
				headers: {
					Authorization: `Bearer ${cache.token}`,
					"Content-Type": "application/json",
					Accept: "application/json"
				}
			}
		);

		const results = response.data;
		log(`received ${results?.chunks?.length ?? 0} chunks`);

		if (storeLocation === "context") {
			context[storeLocationContextKey] = results;
		} else if (storeLocation === "input") {
			// @ts-ignore
			api.addToInput(storeLocationInputKey, results);
		}
	}
});
