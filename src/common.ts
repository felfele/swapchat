const keccak = require('keccak');

export const stripHexPrefix = (s: string) => s.startsWith("0x") ? s.slice(2) : s;

export function hexToArray(data:string):Uint8Array {
	data = stripHexPrefix(data);
	let databuf = new ArrayBuffer(data.length / 2);
	let uintdata = new Uint8Array(databuf);
	for (var i = 0; i < uintdata.length; i++) {
		uintdata[i] = parseInt(data.substring(i*2,(i*2)+2), 16);
	}
	return uintdata;
}

export function arrayToHex(data:any):string {
	let hexout = '';
	data.forEach(function(n) {
		let h = n.toString(16);
		if (h.length == 1) {
			h = "0" + h;
		}
		hexout += h;
	});
	return hexout;
}

// stolen from https://github.com/felfele/felfele/src/Utils.ts
export async function waitMillisec(ms: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
	if (ms > 0) {
	    setTimeout(() => resolve(ms), ms);
	}
    });
}

// stolen from https://github.com/felfele/felfele/src/Utils.ts
export async function waitUntil(untilTimestamp: number, now: number = Date.now()): Promise<number> { const diff = untilTimestamp - now; if (diff > 0) {
	return waitMillisec(diff);
    }
    return 0;
}

export function hash(data):Uint8Array {
	const h = keccak('keccak256');
	h.update(Buffer.from(data));
	return new Uint8Array(h.digest());	
}
