import { getFeedTopic } from '@erebos/api-bzz-base';
import { createHex, BzzAPI  } from '@erebos/swarm';
import { createKeyPair, createPublic, sign } from '@erebos/secp256k1';
import { pubKeyToAddress, hash } from '@erebos/keccak256';

const ec = require('eccrypto');
const aesjs = require("aes-js");

/////////////////////////////////
// HEADER SCRIPT
/////////////////////////////////
//
// these two values should be filled in by chat requester when starting a new chat
// if they are empty, the code should initiate a new chat
let keyTmpRequestPriv = undefined;	// the private key of the feed used to inform chat requester about responder user


// OMIT FOR BROWSER COMPILE
// dev cheat for setting other user (2 is first arg after `ts-node scriptname`)
if (process.argv.length > 2) {
	keyTmpRequestPriv = process.argv[2];
	console.log("using tmpkey from cli: " + keyTmpRequestPriv);
}
// END OMIT FOR BROWSER COMPILE
// END SEPARATE SCRIPT



/////////////////////////////////
// MAIN SCRIPT
/////////////////////////////////
//
// everything below here must be immutable and usable for both requester and responder
// the compiled version of it will be used in the script generation for the responser 
const VERSION = 1;
const GATEWAY_URL = 'http://localhost:8500';
const ZEROHASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MSGPERIOD = 1000;
const MAXCONNECTIONPOLLS = 3;
const AUTHORUSER = "beefc6472de3bba1d389ad8b18348c3df50d680c"; 
const SCRIPTFEEDTOPIC = "646973706f636861745f73637269707400000000000000000000000000000000"; // name = dispochat_script
const SCRIPTFEEDHASH = "c8b0051d921ae84f1676a24eaa7d509302dfbd9902dea17fbebe9e004a4a119b"; 
const HTMLFEEDTOPIC = "646973706f636861745f68746d6c000000000000000000000000000000000000"; // name = dispochat_main, topic 
const HTMLFEEDHASH = "4dce80c0210b318db31094a1e7c694179b24ac22b56f25d44582800f0ca07706";
const FEEDMIME = 'application/bzz-feed';

// creates a date string in format 0000-00-00T00:00:00+00:00
function createManifestDate(timestamp?:number):string {
	if (timestamp === undefined) {
		timestamp = Date.now();
	}
	const ourDate = new Date(timestamp);
	let dateString = ourDate.toISOString().substring(0, "0000-00-00T00:00:00".length);
	const timeZone = ourDate.getTimezoneOffset();
	if (timeZone < 0) {
		dateString += '+';
	} else {
		dateString += '-';
	}
	const tzHours = Math.abs(Math.floor(ourDate.getTimezoneOffset() / 60));
	const hoursString = tzHours.toString();
	if (hoursString.length == 1) {
		dateString += "0";
	}
	dateString += hoursString + ":";
	const tzMinutes = ourDate.getTimezoneOffset() % 60;
	const minutesString = tzMinutes.toString();
	if (minutesString.length == 1) {
		dateString += "0";
	}
	dateString += minutesString;
	return dateString;
}

// varHash is the hash of the HEADER SCRIPT section above
// size is the byte size of the contents of the header script
function createManifest(varHash:string, size:number):string {
	const dateString = createManifestDate();
	const dateStringZero = "0001-01-01T00:00:00Z";
	let o = {entries: [
		{
			hash: varHash,
			path: "head.js",
			contentType: 'application/json',
			mode: 420,
			size: size,
			mod_time: dateString,	
		},
		{
			path: "main.js",
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + SCRIPTFEEDTOPIC,
			}
		},
		{
			path: "index.html",
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + HTMLFEEDTOPIC,
			}
		},
		{
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + HTMLFEEDTOPIC,
			}
		}
	]};
	return JSON.stringify(o);	
}

// TODO: generate webpage on swarm. we only need to post the header script, then fake a manifest which links the application html and main script
function publishResponseScript(bz:any, tmpPrivKey:string):Promise<string> {
	return new Promise((whohoo,doh) => {
		const headScript = "let keyTmpRequestPriv = '" + tmpPrivKey + "';\n";
		bz.upload(
			headScript,
		).then((h) => {
			const manifest = createManifest(h, headScript.length);
			bz.upload(
				manifest,
			).then((h) => {
				console.log("published manifest: " + h);
				whohoo(h);
			}).catch(doh);
		}).catch(doh);	
		let keyTmpRequestPriv = undefined;	// the private key of the feed used to inform chat requester about responder user
		console.log("TODO: upload code to swarm for responder");
	});
}

// Represents messages sent between the peers
// A message without a payload is considered a "ping" message
// If end is set, peer must terminate the chat
class ChatMessage {
	_serial: number
	_lastHashSelf: string
	_lastHashOther: string
	_payload: string = ''
	_padding: number = 0
	_end: boolean

	constructor(lastSelf: string, lastOther: string, serial: number) {
		this._lastHashSelf = lastSelf;
		this._lastHashOther = lastOther;
		this._serial = serial;
	}

	public addPayload = (payload: string) => {
		this._payload += payload;
	}
	
	public setEnd = () => {
		this._end = true;
	}

	public toString = (): string => {
		let o = {
			serial: this._serial,
			lastSelf: this._lastHashSelf,
			lastOther: this._lastHashOther,
			end: this._end,
			payload: undefined
		};
		if (this._payload != "") {
			o.payload = this._payload
		}
		return JSON.stringify(o);
	}
}


// Session object
// keeps track of message order and controls sending and receiving of messages
// our feed is our user and function of peer user as topic
// peer feed is peer user and function of our user as topic
class ChatSession {
	_pollattempts: number = 0		// increments of failed poll attempts, may be used to inform client about when consider chat lost
	_startedAt: number = Date.now();	// time of session start (from perspective of client)
	_lastAt: number = 0			// previous successful message post (includes ping loop)
	_lastHashSelf: string = ZEROHASH	// previous hash from own posts
	_lastHashOther: string = ZEROHASH	// previous hash from peer's posts
	_serial: number = 0			// increments on every message post (includes ping loop)
	_ready: boolean = true			// false while in process of sending messages
	_bzz: BzzAPI				// swarm transport api object
	_userMe: string				// own user, who signs posts
	_userOther: string			// peer user, from whom we receive messages
	_topicMe: string			// topic (function of user of peer)
	_topicOther: string			// topic (function of own user)
	_secret: string				// key to encrypt payloads with
	_loop: any				// interval id for ping loop
	_outCrypt:any				// output symmetric crypter
	_inCrypt:any				// output symmetric crypter

	constructor(url: string, userMe: string, signer: any) {
		const signBytes = signer;
		this._bzz = new BzzAPI({ url: url, signBytes });
		this._userMe = userMe;
		this._topicOther = getFeedTopic({
			name: this.userToTopic(this._userMe)
		});
		this._ready = true;
	}

	public userToTopic = (user: string): string => {
		return createHex(user).toBuffer();
	}

	public getStarted = (): number => {
		return this._startedAt;
	}

	// create a new message from the current state
	// the creation of new messages will be locked until the message is sent
	// if locked, undefined will be returned
	public newMessage = (): ChatMessage => {
		if (!this._ready) {
			return undefined;
		}
		this._ready = false;
		let msg = new ChatMessage(this._lastHashSelf, this._lastHashOther, this._serial);
		this._serial++;
		return msg;
	}

	// attempts to post the message to the feed
	// on success unlocks message creation (newMessage can be called again)
	public sendMessage = (msg: ChatMessage) => {
		const payload = this._outCrypt.encrypt(msg.toString());
		try {
			const h = await uploadToFeed(this._bzz, this._userMe, this._topicMe, payload); 
		} catch(e) {
			this._ready = true;
			throw "error uploading feed: " + e
		}
		this._lastAt = Date.now();
		console.log("uploaded to " + h);
		this._lastHashSelf = h;
		this._ready = true;
		
	}

	// starts the retrieve and post loop after we know the user of the other party
	public async start(userOther: string, secret: string): Promise<any> { 
		console.log("secret: " + secret);
		if (secret.substring(0, 2) === "0x") {
			secret = secret.substring(2, secret.length);
		}
		this._inCrypt = new ChatCipher(secret);
		this._outCrypt = new ChatCipher(secret);
		this._userOther = userOther;
		this._topicMe = getFeedTopic({
			name: this.userToTopic(this._userOther)
		});
		this._loop = setInterval(this._run, MSGPERIOD, this);
	}

	// make sure we have pings sent every period if no other message is in the process of being sent
	_run = (self: any) => {
		if (self._ready && Date.now() - self._lastAt > MSGPERIOD) {
			let msg = self.newMessage();
			self.sendMessage(msg);
		}
	}

	// teardown of chat session
	public async stop(): Promise<any> {
		let self = this;
		return new Promise((whohoo, doh) => {
			clearInterval(self._loop);
			let tryStop = setInterval(function() {
				if (self._ready) {
					let msg = self.newMessage();
					msg.setEnd();
					self.sendMessage(msg);
					clearInterval(tryStop);
					whohoo();
				}
			}, 100);
		});
	}

	// perhaps we should abstract all BzzAPI calls instead
	public bzz = (): any => {
		return this._bzz;
	}
}



// us
const keyPrivSelf = newPrivateKey();
const keyPairSelf = createKeyPair(arrayToHex(keyPrivSelf));
const keyPubSelf = keyPairSelf.getPublic("hex");
const userSelf = pubKeyToAddress(createHex("0x" + keyPubSelf));
const signerSelf = async bytes => sign(bytes, keyPairSelf.getPrivate());


// the handshake feed 
const keyPairTmp = createKeyPair(keyTmpRequestPriv);
const keyTmpPub = keyPairTmp.getPublic("hex");
const userTmp = pubKeyToAddress(createHex("0x" + keyTmpPub));
let topicTmp = "0x";
// BUG: createHex doesn't seem to work for the hash output, annoying!
let topicTmpArray = hash(Buffer.from(keyPairTmp.getPrivate("hex"))); 
topicTmpArray.forEach(function(k) {
	let s = "00" + Math.abs(k).toString(16);
	topicTmp += s.substring(s.length-2, s.length);
	
});
const signerTmp = async bytes => sign(bytes, keyPairTmp.getPrivate());


// the peer
let keyPairOtherPub = undefined;
let userOther = undefined;


// set up the session object
const chatSession = new ChatSession(GATEWAY_URL, userSelf, signerSelf); 

// crypto stuff
function newPrivateKey() {
	return ec.generatePrivate();
}

//function encryptSecret(pubkey, data) {
//	console.log("encrypting secret" + data);
//	return ec.encrypt(pubkey, Buffer.from(data));
//}
//
//function decryptSecret(privkey, data) {
//	console.log("decrypting secret" + data);
//	return ec.decrypt(privkey, data);
//}
//
//function serializeEncrypted(e) {
//	var o = {};
//	for (var k in e) {
//		o[k] = e[k].toString("hex");
//		console.log("setting k " + k + " " + o[k]);
//	}
//	return JSON.stringify(o)
//}
//
//function deserializeEncrypted(j) {
//	var o = JSON.parse(j)
//	var e = {};
//	for (var k in o) {
//		e[k] = Buffer.from(o[k], "hex");
//		console.log("getting k " + k + " " + e[k]);
//	}
//	return e;
//}


// TODO: switch to CTR but needs renegotiation implemented
class ChatCipher {
	_nextSerial: number = 0
	_aes: any

	// takes hex only for now
	constructor(secret:string) {
		//const secretArray = createHex("0x" + secret).toBytesArray();
		//this._aes = new aesjs.ModeOfOperation.ctr(secretArray, new aesjs.Counter(serial));
		const secretArray = hexToArray(secret);
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
	// adds a one byte prefix to the payload, which contains the length of the padding
	// data is padding to multiple of 16 INCLUDING that length byte
	encrypt = (data:string):string => {
		let databytes = aesjs.utils.utf8.toBytes(data);
		let databyteswithpad = new Uint8Array(databytes.length + 1);
		databyteswithpad.set(databytes, 1);
		const padresult = this.pad(databyteswithpad);
		databyteswithpad = padresult.data;
		databyteswithpad[0] = padresult.padLength & 0xff;
		const ciphertext = this._aes.encrypt(databyteswithpad);
		this._nextSerial++;

		// createHex returns strange results here, so manual once again
		return arrayToHex(ciphertext);
	}


	// expects hex input WITHOUT 0x prefix
	// gives utf8 output
	// padding is in bytes (not chars in hex string)
	// see also: encrypt
	decrypt = (data:string, serial:number):string => {
//		if (serial != this._nextSerial) {
//			return undefined;
//		}
		// again createHex doesn't help us
		//const databuf = createHex(data).toBuffer();
		let uintdata = hexToArray(data);
		let plainbytes = this._aes.decrypt(uintdata);
		const padLength = plainbytes[0];
		plainbytes = plainbytes.slice(1, plainbytes.length-padLength);
		return arrayToHex(plainbytes);
	}
}

export function hexToArray(data:string):any {
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


function uploadToFeed(bz: any, user: string, topic: string, data: string): Promise<any> {

	const feedOptions = {
		user: user,
		topic: topic,
	}

	console.log("uploading " + data);
	const h = await bz.upload(data);
	console.log("data uploaded to " + h);
	const r = await bz.setFeedContentHash(feedOptions, h);
	console.log("set feed: " + user + "/" + topic + ": " +  h);
	return h;
}

function downloadFromFeed(bz: any, user: string, topic: string): Promise<any> {
	const feedOptions = {
		user: user,
		topic: topic,
	}

	return bz.getFeedContent(feedOptions, {
		mode: "raw",
	});
}



// if bz is supplied, will update tmp feed
async function connectToPeer(handshakeOther:string, bz:any):Promise<string> {
	// set up the user info for the peer
	// and start the chat session with that info
	keyPairOtherPub = createPublic(handshakeOther); 
	const pubArray = hexToArray(handshakeOther);
	const pubBuffer = Buffer.from(pubArray);

	const secretBuffer = ec.derive(keyPrivSelf, pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	await chatSession.start(userOther, secret);
	return userOther;
}

async function connectToPeerTwo(handshakeOther:string, bz:any):Promise<string> {
	// NB these are globalsss
	keyPairOtherPub = createPublic(handshakePubOther);
	const pubArray = hexToArray(handshakePubOther);
	const pubBuffer = Buffer.from(pubArray);

	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));
		
	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	const myHash = uploadToFeed(bz, userTmp, topicTmp, keyPubSelf);
	await chatSession.start(userOther, secret).then(function() {
	return userOther;	
}

async function checkResponse(myHash:string, bz:any, attempts:number):Promise<string> {
	const r = await downloadFromFeed(bz, userTmp, topicTmp);
	const currentHash = r.url.substring(r.url.length-65, r.url.length-1);
	if (currentHash !== myHash) {

		// catch potential delayed stream reads
		if (keyPairOtherPub !== undefined) {
			return;
		}

		const handshakeOther = await r.text();
		const userOther = await connectToPeer(handshakeOther, undefined);
		return userOther;
	}	
}

// stolen from https://github.com/felfele/felfele/src/Utils.ts
async function waitMillisec(ms: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
	if (ms > 0) {
	    setTimeout(() => resolve(ms), ms);
	}
    });
}

// stolen from https://github.com/felfele/felfele/src/Utils.ts
async function waitUntil(untilTimestamp: number, now: number = Date.now()): Promise<number> {
    const diff = untilTimestamp - now;
    if (diff > 0) {
	return waitMillisec(diff);
    }
    return 0;
}

// Handle the handshake from the peer that responds to the invitation
async function startRequest():Promise<string> {

	let userOther = undefined;
	const signBytes = signerTmp;
	const bz = new BzzAPI({ url: GATEWAY_URL,  signBytes: signerTmp });

	const myHash = await uploadToFeed(bz, userTmp, topicTmp, keyPubSelf);
	console.log("uploaded to " + myHash);
	publishResponseScript(bz, keyPairTmp.getPrivate("hex"));
	for (let i = 0; i < MAXCONNECTIONPOLLS; i++) {
		console.log("check if started, attempt " + i);
		const jetzt = Date.now() + 1000;
		userOther = await checkResponse(myHash, bz, 0);
		if (userOther !== undefined) {	
			return userOther;
		}
		await waitUntil(jetzt);
	}
	throw("no response");
}

async function startResponse():Promise<string> {
	// TODO: derive proper secret from own privkey
	//const secret = ZEROHASH;
	//console.log("secret zero: " + secret.length);
	const signBytes = signerTmp;
	const bz = new BzzAPI({ url: GATEWAY_URL, signBytes: signerTmp });

	const r = await downloadFromFeed(bz, userTmp, topicTmp);
	const handshakePubOther = await r.text();
	const keyPairOtherPub = createPublic(handshakePubOther);
	//const userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	const userOther = await connectToPeerTwo(handshakePubOther, bz);
	//await uploadToFeed(bz, userTmp, topicTmp, keyPubSelf + ZEROHASH);
	return userOther;
}


// debug out central params
console.log("started: " + chatSession.getStarted());
console.log("topic: " + topicTmp);
console.log("user self: " + userSelf);
console.log("tmp priv: " + keyPairTmp.getPrivate("hex"));
console.log("pub self: " + keyPairSelf.getPublic("hex"));
console.log("user other: " + userOther);
console.log("other's feed: " + chatSession._topicOther);


if (keyTmpRequestPriv === undefined) {
	startRequest().then((v) => {
		console.log("started request: " + v);
		// for testing purposes only
		setTimeout(async () => {
			await chatSession.stop();
			console.log("stopped");
		}, 3000);

	}).catch((e) => {
		console.error("error starting response: " + e);
	});
} else {
	startResponse().then((v) => {
		console.log("started request: " + v);
		// for testing purposes only
		setTimeout(async () => {
			await chatSession.stop();
			console.log("stopped");
		}, 3000);
	}).catch((e) => {
		console.error("error starting response: " + e);
	});
}
