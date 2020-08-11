const PING_TIMEOUT_DEFAULT = 5000;

class Ping {
	lastSeen: number;
	lastPong: number;
	otherSerial: number;

	pingTimeout: number; 
	pingTimer: any;
	pingCallback: any;
	selfSerial: number;

	// pingCallback must take two args; bool if true is pong and serial number
	constructor(pingCallback: any, pingTimeout?: number) {
		this.pingCallback = pingCallback;
		if (pingTimeout != undefined) {
			this.pingTimeout = pingTimeout;
		} else {
			this.pingTimeout = PING_TIMEOUT_DEFAULT;
		}
		console.debug('initialized ping');
	}

	public start() {
		console.debug('starting ping');
		this.seen();
	}

	public seen() {
		this.lastSeen = Date.now();
		this.restart();

	}

	public restart() {
		clearTimeout(this.pingTimer);
		console.debug('resetting pingtimer');
		this.pingTimer = setTimeout(this.ping, this.pingTimer);
	}

	public ponged(serial: number) {
		console.debug('pong last/now', this.selfSerial, serial);
		this.seen(),
		this.lastPong = Date.now();
		this.otherSerial = serial;
	}

	public ping() {
		this.restart();
		const serial = this.selfSerial;
		console.debug('sending ping', serial);
		this.selfSerial++;
		this.pingCallback(serial);
	}

	public pinged(serial: number) {
		console.debug('ping last/now', this.otherSerial, serial);
		this.seen();
		this.pingCallback(serial, true);
	}
}

export {
	Ping,
	PING_TIMEOUT_DEFAULT,
}
