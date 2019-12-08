import { createHex, BzzAPI  } from '@erebos/swarm';
import { createKeyPair, createPublic, sign } from '@erebos/secp256k1';
import { pubKeyToAddress, hash } from '@erebos/keccak256';
import * as ec from 'eccrypto';

const REQUEST_PUBLIC_KEY_INDEX = 0;
const RESPONSE_PUBLIC_KEY_INDEX = 1;
const ZEROHASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MSGPERIOD = 1000;

type ManifestCallback = (manifest: string, sharedPrivateKey: string) => void;

let log = console.log;
let keyTmpRequestPriv = getTmpPrivKey();	// the private key of the feed used to inform chat requester about responder user

function getTmpPrivKey(): string | undefined {
	if (typeof window !== 'undefined' && window != null && window.location != null && window.location.search != null && window.location.search.length > 0) {
		const key = window.location.search.slice(1);
		// console.log("using tmpPrivKey from browser: " + key);
		return key;
	}
	// dev cheat for setting other user (2 is first arg after `ts-node scriptname`)
	if (process.argv.length > 2) {
		const tmpPrivKey = process.argv[2];
		// console.log("using tmpkey from cli: " + tmpPrivKey);
		return tmpPrivKey;
	}
	return undefined;
}

// creates the key to a particular feed update chunk, fetchaable with bzz-feed-raw://
function feedToReference(user: string, topic: string, time: number, level: number): string {
	let b = new ArrayBuffer(20+32+7+1);
	let f = new Uint8Array(b);
	let v = new DataView(b);
	f.set(hexToArray(topic), 0);
	f.set(hexToArray(user), 32);
	v.setUint32(20+32, time, true);
	v.setUint8(20+32+7, level);
	let d = hash(Buffer.from(b));
	return arrayToHex(d);
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

// us
const keyPairSelf = createKeyPair(arrayToHex(newPrivateKey()));
const privateKeySelf = "0x" + keyPairSelf.getPrivate("hex");
const publicKeySelf = "0x" + keyPairSelf.getPublic("hex");
const userSelf = pubKeyToAddress(createHex(publicKeySelf).toBuffer());

// const privateKeySelf = "0xae402705d028aac6c62ea98a54b5ae763f527c3e14cf84c89a1e4e4ec4d43921";
// const publicKeySelf = "0x035823ce10d0e06bfc14ff26f50776916fc920c9ce75b5ab8c96e3f395f13d179f";
// const userSelf = "0xa1615832e7196080d058698a8d85b00bbc2a19dd";

console.log('privateKeySelf', {privateKeySelf, publicKeySelf, userSelf});

const signerSelf = async bytes => sign(bytes, privateKeySelf.slice(2));
const keyPrivSelf = createHex(privateKeySelf).toBuffer();
// console.log("keyPrivSelf", keyPrivSelf.length);

// the handshake feed
// const privateKeyTmp = "0x3c35041a11cd5ca8bda7c3aa36c7a8d09d7671977f3055f7d66d6068db5644f8";
// const publicKeyTmp = "0x03f0070f8376b33b3216eaab30f3b12919a4876c2bdf2b21e87754d2f4d75abea1";
// const userTmp = "0x00c13ab42a8650c29998b0a4bb2cd1906128e7de";

const keyPairTmp = createKeyPair(keyTmpRequestPriv && stripHexPrefix(keyTmpRequestPriv));
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
let chatSession = undefined;

// crypto stuff
function newPrivateKey() {
	return ec.generatePrivate();
}

function hexToArray(data:string):Uint8Array {
	data = stripHexPrefix(data);
	let databuf = new ArrayBuffer(data.length / 2);
	let uintdata = new Uint8Array(databuf);
	for (var i = 0; i < uintdata.length; i++) {
		uintdata[i] = parseInt(data.substring(i*2,(i*2)+2), 16);
	}
	return uintdata;
}

function arrayToHex(data:any):string {
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

async function uploadToRawFeed(bzz: BzzAPI, user: string, topic: string, index: number, data: Uint8Array|string|Buffer): Promise<string|undefined> {
	const feedParams = {
		feed: {
			user: user,
			topic: topic,
		},
		epoch: {
			time: index,
			level: 0,
		},
	}

	try {
		const resp = await bzz.postFeedChunk(feedParams, data);
		const ref = await resp.text();
		const url = bzz._url + `bzz-feed-raw:/${ref.replace(/"/g, "")}`;
		console.log('uploadToRawFeed', {url});
		return ref;
	} catch (e) {
		console.error('uploadToRawFeed', {e});
	}
}

async function downloadBufferFromRawFeed(bzz: BzzAPI, user: string, topic: string, index: number): Promise<Buffer> {
	const reference = feedToReference(user, topic, index, 0);
	const url = bzz._url + `bzz-feed-raw:/${reference}`;
	const nodeFetch = require("node-fetch");
	const response = await nodeFetch(url) as Response;
	const dataBuffer = await response.arrayBuffer();
	const b = Buffer.from(dataBuffer, 68, dataBuffer.byteLength - 65 - 68);
	return b;
}

async function downloadFromRawFeed(bzz: BzzAPI, user: string, topic: string, index: number): Promise<string> {
	const b = await downloadBufferFromRawFeed(bzz, user, topic, index);
	const s = b.toString('hex');
	console.log('downloadFromRawFeed', {s});
	return s;
}

// if bz is supplied, will update tmp feed
async function connectToPeer(handshakeOther:string):Promise<string> {
	// set up the user info for the peer
	// and start the chat session with that info
	const otherPub = stripHexPrefix(handshakeOther);
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
	const otherPub = stripHexPrefix(handshakeOther);
	const pubBuffer = Buffer.from(hexToArray(handshakeOther));
	keyPairOtherPub = createPublic(otherPub);

	const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')).toBuffer());
	const myHash = await uploadToRawFeed(bz, userTmp, topicTmp, RESPONSE_PUBLIC_KEY_INDEX, publicKeySelf);
	console.log('connectToPeerTwo', {handshakeOther, userOther})
	await chatSession.start(userOther, secret);
	return userOther;
}

async function checkResponse(bzz: BzzAPI, attempts:number):Promise<string|undefined> {
	try {
		const handshakeOther = await downloadFromRawFeed(bzz, userTmp, topicTmp, RESPONSE_PUBLIC_KEY_INDEX);
		const userOther = await connectToPeer(handshakeOther);
		return userOther;
	} catch (e) {
		return undefined;
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
async function startRequest(bzz: BzzAPI, manifestCallback: ManifestCallback):Promise<void> {
	const myOtherHash = await uploadToRawFeed(bzz, userTmp, topicTmp, REQUEST_PUBLIC_KEY_INDEX, publicKeySelf);
	manifestCallback("", privateKeyTmp);
	for (;;) {
		const nextCheckTime = Date.now() + 1000;
		const userOther = await checkResponse(bzz, 0);
		if (userOther !== undefined) {
			return;
		}
		await waitUntil(nextCheckTime);
	}
}

async function startResponse(bzz: BzzAPI):Promise<string> {
	const handshakePubOther = await downloadFromRawFeed(bzz, userTmp, topicTmp, REQUEST_PUBLIC_KEY_INDEX);
	console.log('handshakePubOther', handshakePubOther);
	const userOther = await connectToPeerTwo(handshakePubOther, bzz);
	return userOther;
}


const newSession = (gatewayAddress: string, messageCallback: any) => {
	const bzz = new BzzAPI({ url: gatewayAddress, signBytes: signerSelf });
	let writeIndex = 0;
	let readIndex = 0;
	let secretHex = undefined;
	const poll = async (userOther: string) => {
		while (true) {
			try {
				console.log('poll', userOther, readIndex, secretHex);
				const encryptedReference = await downloadBufferFromRawFeed(bzz, userOther, ZEROHASH, readIndex);
				const messageReference = await decryptAesGcm(encryptedReference, secretHex);
				const response = await bzz.download(messageReference, {mode: 'raw'});
				const encryptedArrayBuffer = await response.arrayBuffer();
				const message = await decryptAesGcm(new Uint8Array(encryptedArrayBuffer), secretHex);
				readIndex += 1;
				messageCallback({
					payload: () => message,
				});
			} catch (e) {
				console.log('poll failed', e);
				break;
			}
		}
		setTimeout(poll, MSGPERIOD, userOther);
	}
	return {
		sendMessage: async (message: string) => {
			const encryptedMessage = await encryptAesGcm(message, secretHex);
			const messageReference = await bzz.upload(Buffer.from(encryptedMessage));
			const encryptedReference = await encryptAesGcm(messageReference, secretHex);
			const messageReferenceBytes = Buffer.from(encryptedReference)
			const r = await uploadToRawFeed(bzz, userSelf, ZEROHASH, writeIndex, messageReferenceBytes);
			writeIndex += 1;
		},
		start: async (userOther: string, secret: string) => {
			secretHex = secret;
			await poll(userOther);
		}
	}
}

export function init(params: {
	gatewayAddress: string,
	messageCallback: any,
	manifestCallback: ManifestCallback,
	stateCallback: any,
	logFunction: (...args: any[]) => void,
}) {
	log = params.logFunction;
	log('init called');
	const bzz = new BzzAPI({ url: params.gatewayAddress, signBytes: signerTmp });
	chatSession = newSession(params.gatewayAddress, params.messageCallback);
	if (keyTmpRequestPriv === undefined) {
		log('start request');
		startRequest(bzz, params.manifestCallback).then((v) => {
			params.stateCallback();
		}).catch((e) => {
			console.error("error starting request: ", e);
			log("error starting request: ", e);
		});
	} else {
		startResponse(bzz).then((v) => {
			params.stateCallback();
		}).catch((e) => {
			console.error("error starting response: ", e);
			log("error starting response: ", e);
		});
	}
}

export function send(message: string) {
	try {
		chatSession.sendMessage(message);
	} catch(e) {
		console.error(e);
	}
}
