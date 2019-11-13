import { getFeedTopic } from '@erebos/api-bzz-base';
import { createHex, BzzAPI  } from '@erebos/swarm';
import { createKeyPair, createPublic, sign } from '@erebos/secp256k1';
import { pubKeyToAddress, hash } from '@erebos/keccak256';
import { FEEDMIME, SCRIPTFEEDTOPIC, HTMLFEEDTOPIC, AUTHORUSER } from './settings';

const ec = require('eccrypto');
const aesjs = require("aes-js");

/////////////////////////////////
// HEADER SCRIPT
/////////////////////////////////
let keyTmpRequestPriv = getTmpPrivKey();	// the private key of the feed used to inform chat requester about responder user

function getTmpPrivKey(): string | undefined {
	if (typeof window !== 'undefined' && window != null && window.location != null && window.location.search != null && window.location.search.length > 0) {
		const key = window.location.search.slice(1);
		console.log("using tmpPrivKey from browser: " + key);
		return key;
	}
	// dev cheat for setting other user (2 is first arg after `ts-node scriptname`)
	if (process.argv.length > 2) {
		const tmpPrivKey = process.argv[2];
		console.log("using tmpkey from cli: " + tmpPrivKey);
		return tmpPrivKey;
	}
	return undefined;
}



/////////////////////////////////
// MAIN SCRIPT
/////////////////////////////////
//
// everything below here must be immutable and usable for both requester and responder
// the compiled version of it will be used in the script generation for the responser
let GATEWAY_URL = 'http://localhost:8500';
const ZEROHASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MSGPERIOD = 1000;
const MAXCONNECTIONPOLLS = 7;

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
			path: "index.js",
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

type ManifestCallback = (manifest: string, sharedPrivateKey: string) => void;
// TODO: generate webpage on swarm. we only need to post the header script, then fake a manifest which links the application html and main script
function publishResponseScript(bz:any, tmpPrivKey:string, manifestCallback: ManifestCallback):Promise<string> {
	return new Promise((whohoo,doh) => {
		const headScript = "keyTmpRequestPriv = '" + tmpPrivKey + "';\n";
		bz.upload(
			headScript,
		).then((h) => {
			const manifest = createManifest(h, headScript.length);
			bz.upload(
				manifest,
			).then((h) => {
				console.log("published manifest: " + h);
				manifestCallback(h, privateKeyTmp);
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

	constructor(lastSelf?: string, lastOther?: string, serial?: number) {
		this._lastHashSelf = lastSelf;
		this._lastHashOther = lastOther;
		this._serial = serial;
	}

	public setPayload = (payload: string) => {
		this._payload = payload;
	}

	public payload = ():string => {
		return this._payload;
	}

	public setEnd = () => {
		this._end = true;
	}

	public hasEnd = () => {
		return this._end === true;
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

	public fromString = (s:string) => {
		let o = JSON.parse(s);
		this._lastHashSelf = o.lastSelf;
		this._lastHashOther = o.lastOther;
		this._serial = o.serial;
		this._payload = o.payload;
		this._end = o.end;
	}
}

const stripHexPrefix = (s: string) => s.startsWith("0x") ? s.slice(2) : s;

const encryptAesGcm = async (message: string, secretHex: string): Promise<Uint8Array> => {
	try {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const secretArray = hexToArray(stripHexPrefix(secretHex));
		const data = new TextEncoder().encode(message);
		const secretKey = await crypto.subtle.importKey('raw', secretArray, 'AES-GCM', true, ['encrypt', 'decrypt']);
		const ciphertext = await crypto.subtle.encrypt({
			name: 'AES-GCM',
			iv,
		}, secretKey, data);
		const payload = new Uint8Array(iv.length + ciphertext.byteLength);
		payload.set(iv);
		payload.set(new Uint8Array(ciphertext), 12);
		return payload;
	} catch (e) {
		console.log('encryptAesGcm', {e});
	}
}

const decryptAesGcm = async (encryptedData: Uint8Array, secretHex: string): Promise<string> => {
	try {
		const iv = encryptedData.slice(0, 12);
		const ciphertext = encryptedData.slice(12);
		const secretArray = hexToArray(secretHex);
		const secretKey = await crypto.subtle.importKey('raw', secretArray, 'AES-GCM', true, ['encrypt', 'decrypt']);
		const cleartext = await crypto.subtle.decrypt({
			name: 'AES-GCM',
			iv,
		}, secretKey, ciphertext);
		const message = new TextDecoder().decode(cleartext);
		return message;
	} catch (e) {
		console.log('decryptAesGcm', {e});
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
	//_ready: boolean = true			// false while in process of sending messages
	_bzz: BzzAPI				// swarm transport api object
	_userMe: string				// own user, who signs posts
	_userOther: string			// peer user, from whom we receive messages
	_topicMe: string			// topic (function of user of peer)
	_topicOther: string			// topic (function of own user)
	_secret: string				// key to encrypt payloads with
	_outCrypt:any				// output symmetric crypter
	_inCrypt:any				// output symmetric crypter
	_msgPeriod:number = MSGPERIOD
	_messageCallback:any
	_debug:boolean = false
	_running:boolean = true
	_pollSerial:number = 0

	constructor(url: string, userMe: string, signer: any, messageCallback: any) {
		const signBytes = signer;
		this._bzz = new BzzAPI({ url: url, signBytes });
		this._userMe = userMe;
		this._topicOther = getFeedTopic({
			name: this.userToTopic(this._userMe)
		});
		this._messageCallback = messageCallback;
	}

	public setDebug = () => {
		this._debug = true;
	}

	public setMessagePeriod = (p:number) => {
		this._msgPeriod = p;
	}

	public userToTopic = (user: string): string => {
		return createHex(user).toString();
	}

	public getStarted = (): number => {
		return this._startedAt;
	}

	// create a new message from the current state
	// the creation of new messages will be locked until the message is sent
	// if locked, undefined will be returned
	public newMessage = (): ChatMessage => {
		let msg = new ChatMessage(this._lastHashSelf, this._lastHashOther, this._serial);
		this._serial++;
		return msg;
	}

	// attempts to post the message to the feed
	// on success unlocks message creation (newMessage can be called again)
	public sendMessage = async (msg: ChatMessage) => {
		if (this._debug) {
			console.log("sending: " + msg.toString());
		}
		const payload = await encryptAesGcm(msg.toString(), this._secret);
		let h = '';
		try {
			const buf = Buffer.from(payload);
			h = await this._bzz.upload(buf);
		} catch(e) {
			throw "error uploading msg: " + e
		}
		this._lastAt = Date.now();
		this._lastHashSelf = h;
		if (this._debug) {
			console.log("sent message uploaded to " + h);
		}

	}

	// starts the retrieve and post loop after we know the user of the other party
	public async start(userOther: string, secret: string): Promise<any> {
		console.log("secret: " + secret);
		if (secret.substring(0, 2) === "0x") {
			secret = secret.substring(2, secret.length);
		}
		this._secret = secret;
		this._userOther = userOther;
		this._topicMe = getFeedTopic({
			name: this.userToTopic(this._userOther)
		});
		this.ping();
		this.poll();
	}

	// make sure we have pings sent every period if no other message is in the process of being sent
	private ping = async () => {
		if (this._running) {
			let msg = this.newMessage();
			//this.sendMessage(msg);
			const feedOptions = {
				user: this._userMe,
				topic: this._topicMe,
			}
			let r = await this._bzz.setFeedContent(feedOptions, this._lastHashSelf);
			console.log("ping res: " + r);
		}
		if (this._running) {
			setTimeout(this.ping, MSGPERIOD);
		}
	}

	private poll = async () =>  {
		let messages = [];
		let bz = this._bzz;
		let p = undefined;
		try {
			let r = await downloadFromFeed(bz, this._userOther, this._topicOther);
			//let p = this._inCrypt.decrypt(t);
			p = await r.text();
		} catch (e) {
			console.log('downloadFromFeed', e);
			setTimeout(this.poll, this._msgPeriod);
			return;
		}
		console.log("poll recv: " + p);
		if (p === ZEROHASH) {
			setTimeout(this.poll, this._msgPeriod);
			return;
		}

		//let currentHash = msg._lastHashSelf;
		//currentHash = msg._lastHashSelf;
		//messages.push(msg);
		let currentHash = p;
		console.log("Got feed message with hashother " + this._lastHashOther + " curhash " + currentHash + " msgperiod " + this._msgPeriod + " serial" + this._pollSerial);

		while (currentHash != this._lastHashOther) {
			try {
				let r = await bz.download(currentHash, {mode: 'raw'});
				let buf = await r.arrayBuffer();
				const p = await decryptAesGcm(new Uint8Array(buf), this._secret);
				let msg = new ChatMessage();
				msg.fromString(p);
				console.log("hash: cur " + currentHash + " obj " + this._lastHashOther + " msg " + msg._lastHashSelf);
				currentHash = msg._lastHashSelf;
				console.log("Got linked message with lasthash: " + msg._lastHashSelf + " hashother " + this._lastHashOther + " curhash " + currentHash + " msgperiod " + this._msgPeriod + " serial" + this._pollSerial);
				if (msg.hasEnd()) {
					console.log("caught end, terminating");
					this.stop();
					this._running = false;
				}
				messages.push(msg);
			} catch(e) {
				console.error(e);
				break;
			}
		}
		this._pollSerial++;
		this._lastHashOther = p;
		console.log("set lasthash: obj " + this._lastHashOther + " msg " + currentHash);
		if (messages.length > 0) {
			messages.reverse();
			messages.forEach(this._messageCallback);
		}
		if (this._running) {
			setTimeout(this.poll, this._msgPeriod);
		}
	}

	// teardown of chat session
	public async stop(): Promise<any> {
		this._running = false;
		return new Promise((whohoo, doh) => {
			whohoo();
		});
	}

	// perhaps we should abstract all BzzAPI calls instead
	public bzz = (): any => {
		return this._bzz;
	}
}



// us
const keyPairSelf = createKeyPair(arrayToHex(newPrivateKey()));
const privateKeySelf = "0x" + keyPairSelf.getPrivate("hex");
const publicKeySelf = "0x" + keyPairSelf.getPublic("hex");
const userSelf = pubKeyToAddress(createHex(publicKeySelf).toBuffer());

console.log('privateKeySelf', {privateKeySelf, publicKeySelf, userSelf});

// const privateKeySelf = "0xae402705d028aac6c62ea98a54b5ae763f527c3e14cf84c89a1e4e4ec4d43921";
// const publicKeySelf = "0x035823ce10d0e06bfc14ff26f50776916fc920c9ce75b5ab8c96e3f395f13d179f";
// const userSelf = "0xa1615832e7196080d058698a8d85b00bbc2a19dd";

const signerSelf = async bytes => sign(bytes, privateKeySelf.slice(2));
const keyPrivSelf = createHex(privateKeySelf).toBuffer();
console.log("keyPrivSelf", keyPrivSelf.length);

// the handshake feed
// const privateKeyTmp = "0x3c35041a11cd5ca8bda7c3aa36c7a8d09d7671977f3055f7d66d6068db5644f8";
// const publicKeyTmp = "0x03f0070f8376b33b3216eaab30f3b12919a4876c2bdf2b21e87754d2f4d75abea1";
// const userTmp = "0x00c13ab42a8650c29998b0a4bb2cd1906128e7de";

const keyPairTmp = createKeyPair(keyTmpRequestPriv && keyTmpRequestPriv.slice(2));
const privateKeyTmp = "0x" + keyPairTmp.getPrivate("hex");
const publicKeyTmp = "0x" + keyPairTmp.getPublic("hex");
const userTmp = pubKeyToAddress(createHex(publicKeyTmp).toBuffer());

console.log('privateKeyTmp', {privateKeyTmp, publicKeyTmp, userTmp});

let topicTmp = "0x";
// BUG: createHex doesn't seem to work for the hash output, annoying!
let topicTmpArray = hash(Buffer.from(privateKeyTmp));
topicTmpArray.forEach(function(k) {
	let s = "00" + Math.abs(k).toString(16);
	topicTmp += s.substring(s.length-2, s.length);

});
const signerTmp = async bytes => sign(bytes, privateKeyTmp.slice(2));


// the peer
let keyPairOtherPub = undefined;
let userOther = undefined;


// set up the session object
function logMessage(msg:ChatMessage) {
	console.log("got message: " + msg.payload());
}
export let chatSession = undefined;

// crypto stuff
function newPrivateKey() {
	return ec.generatePrivate();
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
	//encrypt = (data:string):string => {
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
		return ciphertext;
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
		const databuf = createHex(data).toBuffer();
		let uintdata = hexToArray(data);
		let plainbytes = this._aes.decrypt(uintdata);
		const padLength = plainbytes[0];
		plainbytes = plainbytes.slice(1, plainbytes.length-padLength);
		return arrayToHex(plainbytes);
	}
}

export function hexToArray(data:string):Uint8Array {
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

async function uploadToFeed(bz: BzzAPI, user: string, topic: string, data: Uint8Array|string): Promise<string> {

	const feedOptions = {
		user: user,
		topic: topic,
	}

	let h = "";
	if (typeof data === 'string') {
		h = await bz.upload(data);
	} else {
		h = await bz.upload(Buffer.from(data));
	}
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

// if bz is supplied, will update tmp feed
async function connectToPeer(handshakeOther:string, bz:any):Promise<string> {
	// set up the user info for the peer
	// and start the chat session with that info
	const otherPub = handshakeOther.slice(2);
	keyPairOtherPub = createPublic(otherPub);
	const pubArray = hexToArray(otherPub);
	const pubBuffer = Buffer.from(pubArray);
	console.log(pubArray);
	console.log(handshakeOther);
	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	console.log(pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')).toBuffer());
	await chatSession.start(userOther, secret);
	return userOther;
}

async function connectToPeerTwo(handshakeOther:string, bz:any):Promise<string> {
	// NB these are globalsss
	const otherPub = handshakeOther.slice(2);
	const pubBuffer = Buffer.from(hexToArray(otherPub));
	keyPairOtherPub = createPublic(otherPub);

	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')).toBuffer());
	const myHash = await uploadToFeed(bz, userTmp, topicTmp, publicKeySelf);
	await chatSession.start(userOther, secret);
	return userOther;
}

async function checkResponse(myHash:string, bz:any, attempts:number):Promise<string> {
	try {
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
	} catch (e) {
		console.log('checkResponse', e);
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
async function waitUntil(untilTimestamp: number, now: number = Date.now()): Promise<number> { const diff = untilTimestamp - now; if (diff > 0) {
	return waitMillisec(diff);
    }
    return 0;
}

// Handle the handshake from the peer that responds to the invitation
async function startRequest(bzz: BzzAPI, manifestCallback: ManifestCallback):Promise<string> {

	let userOther = undefined;

	const myHash = await uploadToFeed(bzz, userTmp, topicTmp, publicKeySelf);
	console.log("uploaded to " + myHash);
	publishResponseScript(bzz, privateKeyTmp, manifestCallback);
	for (;;) {
		const jetzt = Date.now() + 1000;
		userOther = await checkResponse(myHash, bzz, 0);
		if (userOther !== undefined) {
			return userOther;
		}
		await waitUntil(jetzt);
	}
}

async function startResponse(bzz: BzzAPI):Promise<string> {
	const r = await downloadFromFeed(bzz, userTmp, topicTmp);
	const handshakePubOther = await r.text();
	console.log('handshakePubOther', handshakePubOther);
	const userOther = await connectToPeerTwo(handshakePubOther, bzz);
	return userOther;
}

export function init(gatewayAddress: string, messageCallback:any, manifestCallback: ManifestCallback, stateCallback:any) {
	const bzz = new BzzAPI({ url: gatewayAddress, signBytes: signerTmp });
	chatSession = new ChatSession(gatewayAddress, userSelf, signerSelf, messageCallback);
	if (keyTmpRequestPriv === undefined) {
		console.log('start request');
		startRequest(bzz, manifestCallback).then((v) => {
			stateCallback();
		}).catch((e) => {
			console.error("error starting request: ", e);
		});
	} else {
		chatSession.setDebug();
		startResponse(bzz).then((v) => {
			stateCallback();
		}).catch((e) => {
			console.error("error starting response: ", e);
		});
	}
}

export function send(message: string) {
	try {
		let msg = chatSession.newMessage();
		msg.setPayload(message);
		chatSession.sendMessage(msg);
	} catch(e) {
		console.error(e);
	}
}

// for start in node.js
if (typeof process !== 'undefined') {
	// init(logMessage, () => {}, () => {});
	// setInterval(() => send("" + Date.now()), 1000);
}
