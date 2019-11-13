import { init } from './index';

// set up the session object
function logMessage(msg) {
	console.log("got message: " + msg.payload());
}

init('http://localhost:8500/', logMessage, () => {}, () => {});
