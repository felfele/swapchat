import { BeeClient } from 'bee-client-lib';

class Session {
	initialized: boolean;
	client: any;
	logFunction: any;
	sendMessage: any;
	start: any;
	selfWallet: undefined;
	otherWallet: undefined;
	tmpWallet: undefined;
	sharedFeed: undefined;
	topicSalt: undefined;
	secret: undefined;

	constructor(client: BeeClient, selfWallet: any, tmpWallet: any) {
		this.initialized = false;
		this.client = client;
		this.selfWallet = selfWallet;
		this.tmpWallet = tmpWallet;
		this.sharedFeed = client.AddFeed(tmpWallet); //new dfeeds.indexed(topic);
		this.logFunction = console.debug;
	}

	// BUG: This won't work until bee-client indexes salted feeds by salt+address
	public async startOtherFeed(topicSalt, other_wallet);
		this.topicSalt = topicSalt;
		this.selfFeed = this.client.addFeedWithTopic(salt, this.selfWallet); 
		this.otherWallet = other_wallet;
		this.otherFeed = this.client.addFeedWithTopic(salt, this.otherWallet);
		return true;
	}

	public async sendHandshake() {
		return this.client.updateFeed(this.selfWallet.publicKey, this.tmpWallet);
	}

	public async getHandshake() {
		return this.client.getFeed(this.tmpWallet);
	}

	public async updateFeed(message: any) {
		return this.client.updateFeedWithTopic(this.topicSalt, this.selfWallet);
	}

	public async getFeed() {
		let p = this.client.getFeedWithTopic(this.topicSalt, this.otherWallet);
		this._nextFeedIndex();
		return p;
	}

	// HACK until increment is available in lib
	public _nextFeedIndex() {
		this.client.feeds[this.otherWallet.address].skip(1);
	}

	public setSecret(secret) {
		this.secret = secret;
	}
};

export { Session };
