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
const GATEWAY_URL = 'http://localhost:8500';
const ZEROHASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MSGPERIOD = 1000;
const MAXCONNECTIONPOLLS = 3;

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
		this._bzz = new BzzAPI({ url: url, signer });
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
		this._lastAt = Date.now();
		console.log("todo SEND: " + msg);
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


// debug
console.log("started: " + chatSession.getStarted());
console.log("topic: " + topicTmp);
console.log("user self: " + userSelf);
console.log("tmp priv: " + keyPairTmp.getPrivate("hex"));
console.log("pub self: " + keyPairSelf.getPublic("hex"));
console.log("user other: " + userOther);
console.log("other's feed: " + chatSession._topicOther);


// crypto stuff
function newPrivateKey() {
	return ec.generatePrivate();
}

function encryptSecret(pubkey, data) {
	console.log("encrypting secret" + data);
	return ec.encrypt(pubkey, Buffer.from(data));
}

function decryptSecret(privkey, data) {
	console.log("decrypting secret" + data);
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

// TODO: generate webpage on swarm. we only need to post the header script, then fake a manifest which links the application html and main script
function publishResponseScript() {
	console.log("TODO: upload code to swarm for responder");
	return
}


// if bz is supplied, will update tmp feed
async function connectToPeer(handshakeOther:string, bz:any):Promise<string> {
	// set up the user info for the peer
	// and start the chat session with that info
	keyPairOtherPub = createPublic(handshakeOther.substring(0, 130));
	//let secret = handshakeOther.substring(130, handshakeOther.length);
	const pubHex = handshakeOther.substring(0, 130);
	keyPairOtherPub = createPublic(pubHex);
	console.log("payload pub " + handshakeOther.substring(0, 130));
	const pubArray = hexToArray(pubHex);
	console.log("secret pub array: " + pubArray.length + " " + pubArray);
	const pubBuffer = Buffer.from(pubArray);
	console.log("secret pub buffer: " + pubBuffer.length + " " + pubBuffer);

	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	console.log("secret array: " + secretBuffer.length + " " + secretBuffer);

	const secret = arrayToHex(new Uint8Array(secretBuffer));
	console.log("secret sresponse: " + secret.length + " " + " " + secret);
	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	await chatSession.start(keyPairOtherPub, secret);
	return userOther;
}

async function connecToPeerTwo(handshakeOther:string, bz:any):Promise<string> {
	const pubArray = hexToArray(handshakePubOther);
	console.log("secret pub array: " + pubArray.length + " " + pubArray);

	const pubBuffer = Buffer.from(pubArray);
	console.log("secret pub buffer: " + pubBuffer.length + " " + pubBuffer);

	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	console.log("secret array: " + secretBuffer.length + " " + secretBuffer);

	const secret = arrayToHex(new Uint8Array(secretBuffer));
	console.log("secret sresponse: " + secret.length + " " + " " + secret);
	
	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	const myHash = await uploadToFeed(bz, userTmp, topicTmp, keyPubSelf);
	await chatSession.start(keyPairOtherPub, secret);
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
	publishResponseScript();
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
<<<<<<< HEAD
	//const secret = ZEROHASH;
	//console.log("secret zero: " + secret.length);
	const signBytes = signerTmp;
	const bz = new BzzAPI({ url: GATEWAY_URL, signBytes: signerTmp });

	const r = await downloadFromFeed(bz, userTmp, topicTmp);
	const handshakePubOther = await r.text();
	const keyPairOtherPub = createPublic(handshakePubOther);
	//const userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
	const userOther = await connectToPeerTwo(handshakePubOther, bz);
	await uploadToFeed(bz, userTmp, topicTmp, keyPubSelf + ZEROHASH);
	return userOther;
}

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
