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
var secret = "c9d709ffaae7632f2c243271702a1dad461abb2055e9ba7dd9d46b3a17949dfe";
var secretArray = createHex("0x" + secret).toBytesArray();
var aes = new aesjs.ModeOfOperation.ctr(secretArray);
var databytes = aesjs.utils.utf8.toBytes("abcæøå");
console.log("databytes:" + databytes.toString());
var cryptbytes = aes.encrypt(databytes);
console.log("cryptbytes:" + cryptbytes.toString());
var aesd = new aesjs.ModeOfOperation.ctr(secretArray);
var plainbytes = aesd.decrypt(cryptbytes).toString();
console.log("plainbytes:" + plainbytes.toString());

encryptSecret(ec.getPublic(pk), "foo").then(function(o) {
	var s = serializeEncrypted(o);
	console.log(s);
	var e = deserializeEncrypted(s);
	decryptSecret(pk, e).then(function(p) {
		console.log(p);
	}).catch(console.log);
}).catch(console.log);

//
