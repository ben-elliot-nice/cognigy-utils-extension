import { createExtension } from "@cognigy/extension-tools";

/* nodes */
import { getToken } from "./nodes/getToken";

/* connections */
import { cxoneAuth } from "./connections/cxoneAuth";

export default createExtension({
	nodes: [
		getToken
	],

	connections: [
		cxoneAuth
	],

	options: {
		label: "CXone Utils"
	}
});
