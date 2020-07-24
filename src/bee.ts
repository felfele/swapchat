import * as bee from 'bee-client';
import { arrayToHex } from './common';

class Client {
	url: string;

	constructor(url:string) {
		this.url = url;
		bee.chunkDataEndpoint = this.url + '/chunks';
	}

	public uploadChunk(ch):any {
		console.debug('>>>>>>>>>>>>>>>>>>>>>>>', bee.chunkDataEndpoint);
		console.debug('uploadchunk', ch);
		return bee.uploadChunkData(ch.data, arrayToHex(ch.reference));
	}

	public downloadChunk(reference):any {
		console.debug('downloadchunk', reference);
		return bee.downloadChunkData(reference);
	}
}

export { Client };
