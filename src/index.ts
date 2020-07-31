import * as dfeeds from 'dfeeds';
import * as swarm from 'swarm-lowlevel';
import * as wallet from 'swarm-lowlevel/unsafewallet';
import { hexToArray, arrayToHex, waitMillisec, waitUntil, stripHexPrefix } from './common';
import { Session } from './session';
import { BeeClient } from 'bee-client-lib';
import { encryptAesGcm as encrypt } from './crypto';
import { decryptAesGcm as decrypt } from './crypto';
import { hash, derive } from './crypto';

type ManifestCallback = (manifest: string, sharedPrivateKey: string) => void;
type StateCallback = (topicHex: string) => void;

const REQUEST_PUBLIC_KEY_INDEX = 0;
const RESPONSE_PUBLIC_KEY_INDEX = 1;
const MSGPERIOD = 1000;

let log = console.log;

function getTmpPrivKey(): any {
	if (typeof window !== 'undefined' && window != null && window.location != null && window.location.search != null && window.location.search.length > 0) {
		const key = window.location.search.slice(1);
		console.debug("using tmpPrivKey from browser: " + key);
		return hexToArray(key);
	}
	// dev cheat for setting other user (2 is first arg after `ts-node scriptname`)
	if (process.argv.length > 2) {
		let tmpPrivKey = process.argv[2];
		tmpPrivKey = stripHexPrefix(tmpPrivKey);
		console.debug("using tmpkey from cli: " + tmpPrivKey);
		return hexToArray(tmpPrivKey);
	}
	return undefined;
}

// the private key of the feed used to inform chat requester about responder user
let keyTmpRequestPriv = getTmpPrivKey();

const selfWallet = new wallet.Wallet();//Buffer.from(hexToArray(privateKeySelf.substring(2)));
console.log('selfWallet private', arrayToHex(selfWallet.privateKey));
console.log('selfWallet public', arrayToHex(selfWallet.publicKey));
console.log('selfWallet address', selfWallet.getAddress());

let tmpWallet = undefined;
if (keyTmpRequestPriv != undefined) {
	tmpWallet = new wallet.Wallet(Buffer.from(keyTmpRequestPriv));
} else {
	tmpWallet = new wallet.Wallet();
}
console.log('tmpWallet', arrayToHex(tmpWallet.privateKey));

// the peer
let otherWallet = undefined;

let topicTmpArray = hash(tmpWallet.privateKey);
// soc definitions warranted 20 byte topicid
topicTmpArray = topicTmpArray.slice(0, 20);
// we could even choose this then
// topicTmpArray = selfWallet.getAddress('binary');
console.log('topic', arrayToHex(topicTmpArray));

// the master session
let chatSession = undefined;


// if bz is supplied, will update tmp feed
async function connectToPeer(session: any, handshakeOther:any) {
	// set up the user info for the peer
	// and start the chat session with that info
	otherWallet = wallet.newReadOnlyWallet(handshakeOther);
	const secretBytes = await derive(selfWallet.privateKey, otherWallet.publicKey);
	chatSession.setSecret(secretBytes);
	chatSession.startOtherFeed(secretBytes, otherWallet);
	await chatSession.start(session);
	return otherWallet;
}

async function connectToPeerTwo(session: any, handshakeOther:any) {
	// NB these are globalsss
	console.log(handshakeOther);
	otherWallet = wallet.newReadOnlyWallet(handshakeOther);

	const secretBytes = await derive(selfWallet.privateKey, otherWallet.publicKey);

	chatSession.setSecret(secretBytes);
	chatSession.startOtherFeed(secretBytes, otherWallet);
	chatSession.sendHandshake();
	await chatSession.start(session);
	return otherWallet;
}

async function downloadFromFeed(session: any, wallet: wallet.Wallet, socId:string):Promise<any|Buffer> {
	let otherAddress = wallet.getAddress('binary');
	let s = new swarm.soc(socId, undefined, undefined);
	s.setOwnerAddress(otherAddress);
	let socAddress = s.getAddress();
	return await chatSession.client.downloadChunk(arrayToHex(socAddress));
}

async function checkResponse(session: any):Promise<string|undefined> {
	try {
		const soc = await session.getHandshake();
		return await connectToPeer(session, soc.chunk.data);
	} catch (e) {
		console.error('no response yet...' + e);
		return;
	}
}

async function updateFeed(ch) {
	return await chatSession.client.uploadChunk(ch);
}

async function updateData(ch) {
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
async function startRequest(session: Session, manifestCallback: ManifestCallback):Promise<any> {
	session.sendHandshake();
	manifestCallback("", arrayToHex(tmpWallet.privateKey));
	// hack to increment the session index by one
	session.client.feeds[session.tmpWallet.address].index++;
	for (;;) {
		const nextCheckTime = Date.now() + 1000;
		const userOther = await checkResponse(session); //;, bobSocId);
		if (userOther !== undefined) {
			//connectToPeerTwo(session, userOther);
			return;
		}
		await waitUntil(nextCheckTime);
	}
}

async function startResponse(session: any):Promise<any> {
	const soc = await session.getHandshake()
	const userOther = await connectToPeerTwo(session, soc.chunk.data);
	return true
}


const newSession = (gatewayAddress: string, messageCallback: any) => {
	const client = new BeeClient(gatewayAddress);

	let secretHex = undefined;
	const sendEnvelope = async (envelope) => {
		const envelopeJson = JSON.stringify(envelope)
		//const encryptedMessage = await encryptAesGcm(envelopeJson, secretHex);
		//const messageReference = await bzz.upload(Buffer.from(encryptedMessage));
		//const encryptedReference = await encryptAesGcm(messageReference, secretHex);
		//const encryptedReferenceBytes = Buffer.from(encryptedReference)
		//const r = await uploadToRawFeed(bzz, userSelf, topicTmp, writeIndex, encryptedReferenceBytes);
		console.debug('I would have sent this message', envelope);
		//writeIndex += 1;
	}
	const sendMessage = async (message: string) => {
		const envelope = {
			type: 'message',
			message,
		}
		return sendEnvelope(envelope)
	}
	const sendPing = () => {
		const envelope = {
			type: 'ping',
		}
		return sendEnvelope(envelope)
	}
	const sendDisconnect = () => {
		const envelope = {
			type: 'disconnect',
		}
		return sendEnvelope(envelope)
	}
	//const poll = async (otherFeed: any) => {
	const poll = async (session:any) => {
		while (true) {
			try {
				console.debug('poll', session.otherFeed); 
				const message = await session.getOtherFeed();
				//const encryptedReference = await downloadFromFeed(client, otherWallet, socId); //topicTmp); //, readIndex);
				//const messageReference = await decrypt(encryptedReference, secretHex);
				//const response = await client.downloadChunk(messageReference);
				//const encryptedArrayBuffer = await response.arrayBuffer();
				//const message = await decrypt(new Uint8Array(encryptedArrayBuffer), secretHex);
				console.debug('got', message);
				messageCallback({
					type: 'message',
					message: message.chunk.data
				});
			} catch (e) {
				console.log('polled in vain for other...' + e);
				break;
			}
		}
		setTimeout(poll, MSGPERIOD, session);
	}
	//const address = selfWallet.getAddress('binary')
	chatSession = new Session(client, selfWallet, tmpWallet, keyTmpRequestPriv != undefined); //topicTmpArray, address);
	chatSession.sendMessage = async (message: any) => {
			// const encryptedMessage = await encrypt(message, secretHex);
			//const encryptedMessage = new TextEncoder().encode(message);

			//const messageReference = await bzz.upload(Buffer.from(encryptedMessage));
			// const messageReference = await client.uploadChunk(Buffer.from(encryptedMessage));
			// const encryptedReference = await encrypt(messageReference, secretHex);
			// const encryptedReferenceBytes = Buffer.from(encryptedReference)
			//const r = await uploadToRawFeed(bzz, userSelf, topicTmp, writeIndex, encryptedReferenceBytes);

			//const otherSocId = chatSession.selfFeed.next();
			//const soc = new swarm.soc(otherSocId, undefined, selfWallet);

			//let h = new swarm.fileSplitter(soc.setChunk);
			//h.split(message);

			//soc.sign();

			//let chunkData = soc.serializeData();
			//let chunkAddress = soc.getAddress();
//			let resultAddress = await updateFeed({
//				data: chunkData,
//				reference: chunkAddress,
//			});
			let r = await chatSession.client.updateFeedWithSalt(chatSession.secret, message, chatSession.selfWallet);
			console.log(r);
		};
	// TODO: move def to session, with polling as part of constructor
	//chatSession.start = async (userOther: string, secret: string) => {
	//chatSession.start = async (session: any, secret: string) => {
	chatSession.start = async (session: any) => {
			await poll(session); //;chatSession.otherFeed);
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

	// TODO: this guy is global. let's pass him around instead, perhaps?
	chatSession = newSession(params.gatewayAddress, params.messageCallback);
	if (keyTmpRequestPriv === undefined) {
		log('start request');
		startRequest(chatSession, params.manifestCallback).then(() => {
			let topicHex = arrayToHex(topicTmpArray);
			params.stateCallback(topicHex);
			setTimeout(() => chatSession.sendMessage("alice"), 5 * 1000)
		}).catch((e) => {
			console.error("error starting request: ", e);
			log("error starting request: ", e);
		});
	} else {
		log('start response');
		startResponse(chatSession).then(() => {
			let topicHex = arrayToHex(topicTmpArray);
			params.stateCallback(topicHex);
			setTimeout(() => chatSession.sendMessage("bob"), 5 * 1000)
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

export function disconnect() {
	try {
		chatSession.sendDisconnect();
	} catch(e) {
		console.error(e);
	}
}
