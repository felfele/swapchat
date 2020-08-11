const PING_TIMEOUT_DEFAULT = 5000;

class Ping {
	lastSeen: 0;
	lastPong: 0;
	pongSerial: 0;

	pingTimeout: PING_TIMEOUT_DEFAULT;
	pingTimer: undefined;
	pingCallback: undefined;
	pingSerial: 0;

	constructor(pingCallback: any, pingTimeout?: number) {
		this.pingCallback = pingCallback;
		if (pingTimeout != undefined) {
			this.pingTimeout = pingTimeout;
		}
		this.seen();
	}

	public seen() {
		this.lastSeen = Date.now();

	}

	public restart() {
		clearTimeout(pingTimer);
		console.debug('resetting pingtimer');
		this.pingTimer = setTimeout(this.ping, this.pingTimer);
	}

	public pong(serial: number) {
		console.debug('pong last/now', this.lastPongSerial, serial);
		this.seen(),
		this.restart();
		this.lastPong = Date.now();
		this.lastPongSequence = serial;
	}

	public ping() {
		this.restart();
		serial = this.pingSerial;
		this.pingSerial++;
		this.pingCallback(serial);
	}
}

export {
	Ping,
	PING_TIMEOUT_DEFAULT,
}
