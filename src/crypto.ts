import { createKeyPair } from '@erebos/secp256k1'
import { createHex } from '@erebos/swarm'
var ec = require('eccrypto');
var aesjs = require("aes-js");

var pk = ec.generatePrivate();
console.log("privgen: " + pk);
var pkhex = '';
pk.forEach(function(k) {
	var d = k.toString(16);
	if (d.length == 1) {
		d = "0" + d;
	}
	pkhex += d;
});
console.log("pkhex loop: " + pkhex);
var kp = createKeyPair(pkhex);
console.log("priv: " + kp.getPrivate("hex"));
console.log("pub: " + kp.getPublic("hex"));

function encryptSecret(pubkey, data) {
	return ec.encrypt(pubkey, Buffer.from(data));
}

function decryptSecret(privkey, data) {
	console.log("decrypting" + data);
	return ec.decrypt(privkey, data);
}

function serializeEncrypted(e) {
	var o = {};
	for (var k in e) {
		o[k] = e[k].toString("hex");
		console.log("setting k " + k + " " + o[k]);
	}
	return JSON.stringify(o)
}

function deserializeEncrypted(j) {
	var o = JSON.parse(j)
	var e = {};
	for (var k in o) {
		e[k] = Buffer.from(o[k], "hex");
		console.log("getting k " + k + " " + e[k]);
	}
	return e;
}

// TODO: switch to CTR but needs renegotiation implemented
class ChatCipher {
	_nextSerial: number = 0
	_aes: any

	// takes hex only for now
	constructor(secret:string) {
		const secretArray = createHex("0x" + secret).toBytesArray();
		//this._aes = new aesjs.ModeOfOperation.ctr(secretArray, new aesjs.Counter(serial));
		this._aes = new aesjs.ModeOfOperation.ecb(secretArray);
	}

	// TODO: its uint8array but Array<number> doesn't work, test what does to safely type
	// returns object:
	// data: padded data
	// padLength: amount of bytes added as padding
	pad = (data:any):any => {
		const padNeeded = 16 - (data.length % 16);

		// TODO: can assign and guarantee init values to 0?
		let pad = [];
		for (var i = 0; i < padNeeded; i++) {
			pad.push(0x00);
		}

		console.log("datasize: " + data.length + " pad " + padNeeded);	
		const buf = new ArrayBuffer(data.length + padNeeded);
		let newdata = new Uint8Array(buf);
		newdata.set(data, 0);
		newdata.set(pad, data.length);
		console.log("newdata: " + newdata.length);
		return {
			data: newdata,
			padLength: padNeeded,
		};
	}

	// assumes utf8 input
	// serial is currently not used, as ecb mode only needs the secret 
	encrypt = (data:string):string => {
		let databytes = aesjs.utils.utf8.toBytes(data);
		let databyteswithpad = new Uint8Array(databytes.length + 1);
		databyteswithpad.set(databytes, 1);
		const padresult = this.pad(databyteswithpad);
		console.log("databytes: " + databyteswithpad);
		databyteswithpad = padresult.data;
		console.log("databytes: " + databyteswithpad);
		databyteswithpad[0] = padresult.padLength & 0xff;
		console.log("databytes: " + databyteswithpad);
		const ciphertext = this._aes.encrypt(databyteswithpad);
		this._nextSerial++;

		// createHex returns strange results here, so manual once again
		return uint8ToHex(ciphertext);
	}


	// expects hex input WITHOUT 0x prefix
	// gives utf8 output
	// padding is in bytes (not chars in hex string)
	decrypt = (data:string, serial:number):string => {
//		if (serial != this._nextSerial) {
//			return undefined;
//		}
		// again createHex doesn't help us
		//const databuf = createHex(data).toBuffer();
		console.log("before decode: "  + data);
		let uintdata = hexToUint8(data);
		let plainbytes = this._aes.decrypt(uintdata);
		const padLength = plainbytes[0];
		plainbytes = plainbytes.slice(1, plainbytes.length-padLength);
		return uint8ToHex(plainbytes);
	}
}

function hexToUint8(data:string):any {
	let databuf = new ArrayBuffer(data.length / 2);
	let uintdata = new Uint8Array(databuf);
	for (var i = 0; i < uintdata.length; i++) {
		uintdata[i] = parseInt(data.substring(i*2,(i*2)+2), 16);
	}
	return uintdata;
}

function uint8ToHex(data:any):string {
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

//var data = "abcæøå";
var data = "foo";
var secret = "c9d709ffaae7632f2c243271702a1dad461abb2055e9ba7dd9d46b3a17949dfe";
const c = new ChatCipher(secret);
//console.log(data);
const cipher = c.encrypt(data);
console.log(cipher);
// add padding to decrypt
const plain = c.decrypt(cipher, 0);
console.log(plain);

//
//var secretArray = createHex("0x" + secret).toBytesArray();
//var aes = new aesjs.ModeOfOperation.ctr(secretArray);
//var databytes = aesjs.utils.utf8.toBytes();
//console.log("databytes:" + databytes.toString());
//var cryptbytes = aes.encrypt(databytes);
//console.log("cryptbytes:" + cryptbytes.toString());
//var aesd = new aesjs.ModeOfOperation.ctr(secretArray);
//var plainbytes = aesd.decrypt(cryptbytes).toString();
//console.log("plainbytes:" + plainbytes.toString());
//
