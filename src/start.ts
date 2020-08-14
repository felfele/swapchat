import { init } from './index';

if ((typeof process !== 'undefined') && (typeof process.versions.node !== 'undefined')) {
	const { Crypto } = require("node-webcrypto-ossl");
	global.crypto = new Crypto({
		directory: "key_storage"
	})
}


// set up the session object
function logMessage(msg) {
	console.debug("got message", msg.payload());
}

init({
	gatewayAddress: 'http://localhost:8080',
	messageCallback: logMessage,
	manifestCallback: () => {},
	stateCallback: () => {},
	logFunction: console.debug,
});
