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

	constructor(client: any, sharedFeed: any) {
		this.initialized = false;
		this.client = client;
		this.sharedFeed = sharedFeed;
	}

};

export { Session };
