import { BeeClient } from 'bee-client-lib';
import { arrayToHex, hexToArray } from './common';

class Client {
	url: string;
	client: BeeClient;

	constructor(url:string) {
		this.url = url;
		this.client = new BeeClient(this.url + '/chunks');
	}

	// TODO: transform result to array
	public uploadChunk(ch):any {
		console.debug('uploadchunk', ch);
		return this.client.uploadChunkData(ch.data, arrayToHex(ch.reference));
	}

	public downloadChunk(reference: any) {
		// TODO: isReference should be in swarm-lowlevel
		if (reference == undefined) {
			throw 'invalid reference';
		}
		console.debug('downloadchunk', reference);
		return this.client.downloadChunkData(reference);
	}
}

export { Client };
