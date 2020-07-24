import * as bee from 'bee-client';
import { arrayToHex, hexToArray } from './common';

class Client {
	url: string;

	constructor(url:string) {
		this.url = url;
		bee.chunkDataEndpoint = this.url + '/chunks';
	}

	// TODO: transform result to array
	public uploadChunk(ch):any {
		console.debug('uploadchunk', ch);
		return bee.uploadChunkData(ch.data, arrayToHex(ch.reference));
	}

	public downloadChunk(reference: any) {
		// TODO: isReference should be in swarm-lowlevel
		if (reference == undefined) {
			throw 'invalid reference';
		}
		console.debug('downloadchunk', reference);
		return bee.downloadChunkData(reference);
	}
}

export { Client };
