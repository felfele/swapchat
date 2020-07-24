import * as dfeeds from 'dfeeds';

import { Client } from './bee';

class Session {
	initialized: boolean;
	client: any;
	logFunction: any;
	sendMessage: any;
	start: any;
	selfFeed: undefined;
	otherFeed: undefined;
	sharedFeed: undefined;

	constructor(client: any, topic: any, address) {
		this.initialized = false;
		this.client = client;
		this.sharedFeed = new dfeeds.indexed(topic);
		this.selfFeed = new dfeeds.indexed(address);
		this.logFunction = console.debug;
	}

	public setOtherFeed(address) {
		this.otherFeed = new dfeeds.indexed(address);
	}
};

export { Session };
