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
	// assumes utf8 input
	encrypt = (data:string, serial:number):string => {
		if (serial != this._nextSerial) {
			return undefined;
		}
		let databytes = aesjs.utils.utf8.toBytes(data);
		databytes = this.pad(databytes);
		const ciphertext = this._aes.encrypt(databytes);
		this._nextSerial++;
		return ciphertext
	}

	// TODO: its uint8array but Array<number> doesn't work, test what does to safely type
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
		return newdata;
	}

	// gives utf8 output
	decrypt = (data:string, serial:number):string => {
		return data
	}
}

var data = "abcæøå";
var secret = "c9d709ffaae7632f2c243271702a1dad461abb2055e9ba7dd9d46b3a17949dfe";
var c = new ChatCipher(secret);

for (var i = 0; i < 5; i++) {
	console.log(c.encrypt(data, i));
}

var c = new ChatCipher(secret);
for (var i = 0; i < 5; i++) {
	console.log(c.encrypt(data, i));
}
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
