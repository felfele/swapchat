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

	constructor(client: any, topic: any) {
		this.initialized = false;
		this.client = client;
		this.sharedFeed = new dfeeds.indexed(topic);
		this.selfFeed = new dfeeds.indexed(topic);
		this.otherFeed = new dfeeds.indexed(topic);
	}

};

export { Session };
