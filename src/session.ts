import { BeeClient } from 'bee-client-lib';
import { Ping } from './ping';

class Session {
	initialized: boolean;
	client: any;
	logFunction: any;

	selfWallet;
	otherWallet;
	tmpWallet;

	selfFeed: undefined;
	otherFeed: undefined;
	sharedFeed: undefined;

	topicSalt;
	secret: undefined;

	ping: Ping;

	poller: any;
	loop: any;

	constructor(client: BeeClient, selfWallet: any, tmpWallet: any, skipFirst: boolean = false) {
		this.initialized = false;
		this.client = client;
		this.selfWallet = selfWallet;
		this.tmpWallet = tmpWallet;
		if (skipFirst) {
			console.log('skip');
			this.sharedFeed = client.addFeed(tmpWallet, 1); //new dfeeds.indexed(topic);
		} else {
			this.sharedFeed = client.addFeed(tmpWallet); //new dfeeds.indexed(topic);
		}
		this.logFunction = console.debug;
		this.ping = new Ping(this.sendPing);
	}

	public async startOtherFeed(topicSalt, other_wallet) {
		this.topicSalt = topicSalt;
		this.selfFeed = this.client.addFeedWithSalt(topicSalt, this.selfWallet);
		this.otherWallet = other_wallet;
		this.otherFeed = this.client.addFeedWithSalt(topicSalt, this.otherWallet, 0);
		return true;
	}

	public async sendHandshake() {
		let r = this.client.updateFeed(this.selfWallet.publicKey, this.tmpWallet);
		return r;

	}

	public async getHandshake() {
		return this.client.getFeed(this.tmpWallet);
	}

	public async updateFeed(message: any) {
		return this.client.updateFeedWithSalt(this.topicSalt, message, this.selfWallet);
	}

	public async getOtherFeed() {
		let p = await this.client.getFeedWithSalt(this.topicSalt, this.otherWallet);
		this._nextFeedIndex();
		return p;
	}

	// HACK until increment is available in lib
	public _nextFeedIndex() {
		this.client.feeds[this.topicSalt][this.otherWallet.address].skip(1);
	}

	public setSecret(secret) {
		this.secret = secret;
	}

	public setPinger(pinger: any) {
		this.ping = pinger;
	}

	public stop() {
		clearTimeout(this.loop);
	}

	public sendMessage = async (message: string) => {
		this.ping.restart();
		const envelope = {
			type: 'message',
			data: message,
		}
		this.sendEnvelope(envelope)
	}
	public sendPing = async (serial: number, pong?: boolean) => {
		const envelope = {
			type: 'ping',
			pong: pong,
			serial: serial,
		}
		this.sendEnvelope(envelope)
	}
	public sendDisconnect = async () => {
		this.stop();
		console.debug('terminated main loop');
		const envelope = {
			type: 'disconnect',
		}
		this.sendEnvelope(envelope)
	}

	public sendEnvelope = async (envelope:any) => {
		const envelopeJson = JSON.stringify(envelope)
		//const encryptedMessage = await encryptAesGcm(envelopeJson, secretHex);
		//const messageReference = await bzz.upload(Buffer.from(encryptedMessage));
		//const encryptedReference = await encryptAesGcm(messageReference, secretHex);
		//const encryptedReferenceBytes = Buffer.from(encryptedReference)
		//const r = await uploadToRawFeed(bzz, userSelf, topicTmp, writeIndex, encryptedReferenceBytes);
		//let r = await this.client.updateFeedWithSalt(chatSession.secret, JSON.stringify(envelope), chatSession.selfWallet);
		let r = await this.client.updateFeedWithSalt(this.secret, JSON.stringify(envelope), this.selfWallet);
		console.log(r);
		//writeIndex += 1;
	}

	public setPoller(poller: any) {
		this.poller = poller;
	}

	public async start() {
		this.ping.start();
		this.loop = setTimeout(this.poller, 0, this);
		//await this.poller(this); 
	}
};

export { Session };
