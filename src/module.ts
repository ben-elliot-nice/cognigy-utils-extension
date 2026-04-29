import { createExtension } from "@cognigy/extension-tools";

/* nodes */
import { getToken } from "./nodes/getToken";
import { getChunks } from "./nodes/getChunks";
import { knowledgeTool } from "./nodes/knowledgeTool";

/* connections */
import { cxoneAuth } from "./connections/cxoneAuth";

export default createExtension({
	nodes: [
		getToken,
		getChunks,
		knowledgeTool
	],

	connections: [
		cxoneAuth
	],

	options: {
		label: "CXone Utils"
	}
});
