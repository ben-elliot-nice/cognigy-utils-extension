import { createExtension } from "@cognigy/extension-tools";

/* nodes */
import { getToken } from "./nodes/getToken";
import { getChunks } from "./nodes/getChunks";
import { sendSignal } from "./nodes/sendSignal";
import { startScript } from "./nodes/startScript";

/* connections */
import { cxoneAuth } from "./connections/cxoneAuth";

export default createExtension({
	nodes: [
		getToken,
		getChunks,
		sendSignal,
		startScript
	],

	connections: [
		cxoneAuth
	],

	options: {
		label: "CXone Utils"
	}
});
