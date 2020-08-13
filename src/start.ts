import { init } from './index';

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
