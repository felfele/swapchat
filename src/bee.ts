import * as bee from 'bee-client';

class Client {
	url: string;

	constructor(url:string) {
		this.url = url;
		bee.chunkDataEndpoint = this.url + '/chunks';
	}

	public uploadChunk(ch):any {
		console.debug('>>>>>>>>>>>>>>>>>>>>>>>', bee.chunkDataEndpoint);
		console.debug('uploadchunk', ch);
		return bee.uploadChunkData(ch);
	}

	public downloadChunk(reference):any {
		console.debug('downloadchunk', reference);
		return bee.downloadChunkData(reference);
	}
}

export { Client };
