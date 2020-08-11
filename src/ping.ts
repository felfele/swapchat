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
		this.selfSerial = 0;
		this.otherSerial = 0;
		this.lastSeen = 0;
		this.lastPong = 0;
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
		console.debug('resetting pingtimer', this.pingTimer);
		this.pingTimer = setTimeout(this.ping, this.pingTimeout);
	}

	public ponged(serial: number) {
		
		console.debug('pong last/now', this.selfSerial, serial);
		this.seen(),
		this.lastPong = Date.now();
		this.otherSerial = serial;
	}

	public ping = (self: any) => {
		this.restart();
		const serial = this.selfSerial;
		console.debug('sending ping', serial);
		this.selfSerial++;
		this.pingCallback(serial);
	}

	public pinged(serial: number) {
		if (Date.now() - this.lastSeen < this.pingTimeout) {
			console.debug('dropping premature pong reply');
		}
		console.debug('ping last/now', this.otherSerial, serial);
		this.seen();
		this.pingCallback(serial, true);
	}
}

export {
	Ping,
	PING_TIMEOUT_DEFAULT,
}
