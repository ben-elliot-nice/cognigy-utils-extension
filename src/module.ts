import { createExtension } from "@cognigy/extension-tools";

/* nodes */
import { getToken } from "./nodes/getToken";
import { getChunks } from "./nodes/getChunks";
import { sendSignal } from "./nodes/sendSignal";

/* connections */
import { cxoneAuth } from "./connections/cxoneAuth";

export default createExtension({
	nodes: [
		getToken,
		getChunks,
		sendSignal
	],

	connections: [
		cxoneAuth
	],

	options: {
		label: "CXone Utils"
	}
});
