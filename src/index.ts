import * as ec from 'eccrypto'; // TODO: move derive to wallet
import * as dfeeds from 'dfeeds';
import * as swarm from 'swarm-lowlevel';
import * as wallet from 'swarm-lowlevel/unsafewallet';
import { hexToArray, arrayToHex, waitMillisec, waitUntil, stripHexPrefix, hash } from './common';
import { Session } from './session';
import { Client } from './bee';

type ManifestCallback = (manifest: string, sharedPrivateKey: string) => void;
type StateCallback = (topicHex: string) => void;

const REQUEST_PUBLIC_KEY_INDEX = 0;
const RESPONSE_PUBLIC_KEY_INDEX = 1;
const MSGPERIOD = 1000;

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
//const keyPairSelf = createKeyPair(arrayToHex(newPrivateKey()));
//const privateKeySelf = "0x" + keyPairSelf.getPrivate("hex");
//const publicKeySelf = "0x" + keyPairSelf.getPublic("hex");
//const userSelf = pubKeyToAddress(createHex(publicKeySelf).toBuffer());
const selfWallet = new wallet.Wallet();//Buffer.from(hexToArray(privateKeySelf.substring(2)));

// const privateKeySelf = "0xae402705d028aac6c62ea98a54b5ae763f527c3e14cf84c89a1e4e4ec4d43921";
// const publicKeySelf = "0x035823ce10d0e06bfc14ff26f50776916fc920c9ce75b5ab8c96e3f395f13d179f";
// const userSelf = "0xa1615832e7196080d058698a8d85b00bbc2a19dd";

//console.log('privateKeySelf', {privateKeySelf, publicKeySelf, userSelf});
console.log('selfWallet', {selfWallet});

//const signerSelf = async bytes => sign(bytes, privateKeySelf.slice(2));
//const keyPrivSelf = createHex(privateKeySelf).toBuffer();
// console.log("keyPrivSelf", keyPrivSelf.length);

// the handshake feed
// const privateKeyTmp = "0x3c35041a11cd5ca8bda7c3aa36c7a8d09d7671977f3055f7d66d6068db5644f8";
// const publicKeyTmp = "0x03f0070f8376b33b3216eaab30f3b12919a4876c2bdf2b21e87754d2f4d75abea1";
// const userTmp = "0x00c13ab42a8650c29998b0a4bb2cd1906128e7de";

//let keyPairTmp = undefined;
let tmpWallet = undefined;
if (keyTmpRequestPriv != undefined) {
	//keyPairTmp = createKeyPair(keyTmpRequestPriv && stripHexPrefix(keyTmpRequestPriv));
	tmpWallet = new wallet.Wallet(Buffer.from(hexToArray(keyTmpRequestPriv.substring(2))));
} else {
	//keyPairTmp = createKeyPair();
	tmpWallet = new wallet.Wallet();
}

//const privateKeyTmp = "0x" + keyPairTmp.getPrivate("hex");
//const publicKeyTmp = "0x" + keyPairTmp.getPublic("hex");
//const userTmp = pubKeyToAddress(createHex(publicKeyTmp).toBuffer());

//console.log('privateKeyTmp', {privateKeyTmp, publicKeyTmp, userTmp});
console.log('tmpWallet', {tmpWallet});

let topicTmp = "0x";
// BUG: createHex doesn't seem to work for the hash output, annoying!
//let topicTmpArray = hash(Buffer.from(privateKeyTmp));
let topicTmpArray = hash(selfWallet.privateKey); //Buffer.from(privateKeyTmp));
topicTmpArray.forEach(function(k) {
	let s = "00" + Math.abs(k).toString(16);
	topicTmp += s.substring(s.length-2, s.length);
});

// the peer
let otherWallet = undefined;
//let keyPairOtherPub = undefined;
//let userOther = undefined;

// the master session
let chatSession = undefined;

// crypto stuff
//function newPrivateKey() {
//	return ec.generatePrivate();
//}


//async function uploadToRawFeed(bzz: Bzz, user: string, topic: string, index: number, data: Uint8Array|string|Buffer): Promise<void> {
//	const feedParams = {
//		user: user,
//		topic: topic,
//		time: index,
//		level: 0,
//	}
//
//	try {
//		const resp = await bzz.setRawFeedContent(feedParams, data);
//	} catch (e) {
//		console.error('uploadToRawFeed', {e});
//	}
//}

//async function downloadBufferFromRawFeed(bzz: Bzz, user: string, topic: string, index: number): Promise<Buffer> {
//	const response = await bzz.getRawFeedContent({
//		user,
//		topic,
//		level: 0,
//		time: index,
//	}, {
//		mode: 'raw',
//	});
//	const dataBuffer = await response.arrayBuffer();
//	return dataBuffer;
//}

// if bz is supplied, will update tmp feed
async function connectToPeer(handshakeOther:string):Promise<string> {
	// set up the user info for the peer
	// and start the chat session with that info
	const otherPub = stripHexPrefix(handshakeOther);
	//keyPairOtherPub = createPublic(otherPub);
	otherWallet = wallet.newReadOnlyWallet(otherPub);
	//const pubArray = hexToArray(otherPub);
	//const pubBuffer = Buffer.from(pubArray);
	//console.log(pubArray);
	chatSession.logFunction(handshakeOther);

	//const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	const secretBuffer = await ec.derive(selfWallet.privateKey, otherWallet.publicKey);
	//console.log(pubBuffer);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	//userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')).toBuffer());
	//await chatSession.start(userOther, secret);
	await chatSession.start(otherWallet.getAddress(), secret);
	//return userOther;
	return otherWallet;
}

async function connectToPeerTwo(handshakeOther:string, bz:any):Promise<string> {
	// NB these are globalsss
	const otherPub = stripHexPrefix(handshakeOther);
	//const pubBuffer = Buffer.from(hexToArray(handshakeOther));
	//keyPairOtherPub = createPublic(otherPub);
	otherWallet = wallet.newReadOnlyWallet(otherPub);

	//const secretBuffer = await ec.derive(keyPrivSelf, pubBuffer);
	const secretBuffer = await ec.derive(selfWallet.privateKey, otherWallet.publicKey);
	const secret = arrayToHex(new Uint8Array(secretBuffer));

	//userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')).toBuffer());
	//const myHash = await uploadToRawFeed(bz, userTmp, topicTmp, RESPONSE_PUBLIC_KEY_INDEX, publicKeySelf);
	//console.log('connectToPeerTwo', {handshakeOther, userOther})
	//await chatSession.start(userOther, secret);
	await chatSession.start(otherWallet.getAddress(), secret);
	//return userOther;
	return otherWallet;
}

async function downloadFromFeed(session:any, wallet:wallet.Wallet, topic:string, pidx:number):Promise<any|Buffer> {
	throw 'implement downloadfromdfeed!';
	return Buffer.from([]);
}

//async function checkResponse(bzz: Bzz):Promise<string|undefined> {
async function checkResponse(session: any):Promise<string|undefined> {
	try {
		//const handshakeOtherBuffer = await downloadBufferFromRawFeed(bzz, userTmp, topicTmp, RESPONSE_PUBLIC_KEY_INDEX);
		const handshakeOtherBuffer = await downloadFromFeed(session, tmpWallet, topicTmp, RESPONSE_PUBLIC_KEY_INDEX);
		const handshakeOther = Buffer.from(handshakeOtherBuffer).toString();
		const userOther = await connectToPeer(handshakeOther);
		return userOther;
	} catch (e) {
		return undefined;
	}
}

async function updateFeed(ch) {
	console.debug('updatefeed', ch, arrayToHex(ch.reference));
	let h = await chatSession.client.uploadChunk(ch);
}

async function updateData(ch) {
	console.debug('updatechunk', ch);
	let dataLength = ch.span.length + ch.data.length;
	let data = new Uint8Array(dataLength);
	for (let i = 0; i < ch.span.length; i++) {
		data[i] = ch.span[i];
	}
	for (let i = 0; i < ch.data.length; i++) {
		data[i+ch.span.length] = ch.data[i];
	}
	let h = await chatSession.client.uploadChunk({
		data: data,
		reference: ch.reference
	});	
}

// Handle the handshake from the peer that responds to the invitation
//async function startRequest(bzz: Bzz, manifestCallback: ManifestCallback):Promise<string> {
async function startRequest(session: any, manifestCallback: ManifestCallback):Promise<string> {
//	let publicKeySelfChunk = undefined;
//	function cb(ch) {
//		publicKeySelfChunk = ch;
//	}

	const nextSocId = chatSession.sharedFeed.next();
	//const soc = new swarm.soc(nextSocId, undefined, socSignerTmp, updateFeed);
	const soc = new swarm.soc(nextSocId, undefined, tmpWallet, updateFeed);

	let h = new swarm.fileSplitter(soc.setChunk);
	//h.split(hexToArray(publicKeySelf.substring(2)));
	h.split(tmpWallet.publicKey);
	updateData(soc.chunk);

	soc.sign();

	//h = new swarm.fileSplitter(soc.setChunk);
	//h.split(hexToArray(publicKeySelf.substring(2)));
	
	let chunkData = soc.serializeData();
	let chunkAddress = soc.getAddress();

	console.debug('data, address', chunkData, chunkAddress);


	//const myOtherHash = await uploadToRawFeed(bzz, userTmp, topicTmp, REQUEST_PUBLIC_KEY_INDEX, publicKeySelf);
	//manifestCallback("", privateKeyTmp);
	manifestCallback("", tmpWallet);
	for (;;) {
		const nextCheckTime = Date.now() + 1000;
		//const userOther = await checkResponse(bzz);
		const userOther = await checkResponse(session);
		if (userOther !== undefined) {
			return stripHexPrefix(topicTmp);
		}
		await waitUntil(nextCheckTime);
	}
}

async function startResponse(session: object):Promise<string> {
	//const handshakePubOtherBuffer = await downloadBufferFromRawFeed(bzz, userTmp, topicTmp, REQUEST_PUBLIC_KEY_INDEX);
	const handshakePubOtherBuffer = await downloadFromFeed(session, tmpWallet, topicTmp, REQUEST_PUBLIC_KEY_INDEX);
	const handshakePubOther = Buffer.from(handshakePubOtherBuffer).toString();
	console.log('handshakePubOther', handshakePubOther);
	//const userOther = await connectToPeerTwo(handshakePubOther, bzz);
	const userOther = await connectToPeerTwo(handshakePubOther, session);
	return stripHexPrefix(topicTmp);
}


const newSession = (gatewayAddress: string, messageCallback: any) => {
//	const swarmClient = new SwarmClient({bzz: {
//		url: gatewayAddress,
//		signBytes: signerSelf
//	}});
//	const bzz = swarmClient.bzz;
	const client = new Client(gatewayAddress);

	let writeIndex = 0;
	let readIndex = 0;
	let secretHex = undefined;
	const poll = async (userOther: string) => {
		while (true) {
			try {
				console.log('poll', userOther, readIndex, secretHex);
				//const encryptedReference = await downloadBufferFromRawFeed(bzz, userOther, topicTmp, readIndex);
				const encryptedReference = await downloadFromFeed(client, otherWallet, topicTmp, readIndex);
				const messageReference = await decryptAesGcm(encryptedReference, secretHex);
				//const response = await bzz.download(messageReference, {mode: 'raw'});
				const response = await client.downloadChunk(messageReference);
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
	const tmpFeed = new dfeeds.indexed(topicTmpArray);
	chatSession = new Session(client, tmpFeed);
	chatSession.sendMessage = async (message: string) => {
			const encryptedMessage = await encryptAesGcm(message, secretHex);
			//const messageReference = await bzz.upload(Buffer.from(encryptedMessage));
			const messageReference = await client.uploadChunk(Buffer.from(encryptedMessage));
			const encryptedReference = await encryptAesGcm(messageReference, secretHex);
			const encryptedReferenceBytes = Buffer.from(encryptedReference)
			//const r = await uploadToRawFeed(bzz, userSelf, topicTmp, writeIndex, encryptedReferenceBytes);
			writeIndex += 1;
		};
	chatSession.start = async (userOther: string, secret: string) => {
			secretHex = secret;
			await poll(userOther);
		};
	return chatSession;
}

export function init(params: {
	gatewayAddress: string,
	messageCallback: any,
	manifestCallback: ManifestCallback,
	stateCallback: StateCallback,
	logFunction: (...args: any[]) => void,
}) {
	log = params.logFunction;
	log('init called');
//	const swarmClient = new SwarmClient({bzz: {
//		url: params.gatewayAddress,
//		signBytes: signerTmp,
//	}});
//	const bzz = swarmClient.bzz;
	const bzz = undefined;

	// TODO: this guy is global. let's pass him around instead, perhaps?
	chatSession = newSession(params.gatewayAddress, params.messageCallback);
	if (keyTmpRequestPriv === undefined) {
		log('start request');
		//startRequest(bzz, params.manifestCallback).then((topicHex) => {
		startRequest(chatSession, params.manifestCallback).then((topicHex) => {
			params.stateCallback(topicHex);
		}).catch((e) => {
			console.error("error starting request: ", e);
			log("error starting request: ", e);
		});
	} else {
		//startResponse(bzz).then((topicHex) => {
		startResponse(chatSession).then((topicHex) => {
			params.stateCallback(topicHex);
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
