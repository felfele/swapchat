import { init } from './index';

// set up the session object
function logMessage(msg) {
	console.log("got message: " + msg.payload());
}

init({
	gatewayAddress: 'http://localhost:8500/',
	messageCallback: logMessage,
	manifestCallback: () => {},
	stateCallback: () => {},
	logFunction: console.log,
});
