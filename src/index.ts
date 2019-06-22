import { getFeedTopic } from '@erebos/api-bzz-base'
import { createHex, BzzAPI  } from '@erebos/swarm';
import { createKeyPair, createPublic, sign } from '@erebos/secp256k1'
import { pubKeyToAddress, hash } from '@erebos/keccak256'


/////////////////////////////////
// HEADER SCRIPT
/////////////////////////////////
//
// these two values should be filled in by chat requester when starting a new chat
// if they are empty, the code should initiate a new chat
let keyTmpRequestPriv = undefined;	// the private key of the feed used to inform chat requester about responder user
//let keyOtherPub = ""; 		// the public key of the chat requester

// OMIT FOR BROWSER COMPILE
// dev cheat for setting other user (2 is first arg after `ts-node scriptname`)
if (process.argv.length > 2) {
//	keyOtherPub = process.argv[2];
//	console.log("using other from cli: " + keyOtherPub);
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
	_end: boolean

	constructor(lastSelf: string, lastOther: string, serial: number) {
		this._lastHashSelf = lastSelf;
		this._lastHashOther = lastOther;
		this._serial = serial;
	}

	addPayload = (payload: string) => {
		this._payload += payload;
	}
	
	setEnd = () => {
		this._end = true;
	}

	toString = (): string => {
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

	constructor(url: string, userMe: string, signer: any) {
		this._bzz = new BzzAPI({ url: url, signer });
		this._userMe = userMe;
		this._topicOther = getFeedTopic({
			name: this.userToTopic(this._userMe)
		});
		this._ready = true;
	}

	userToTopic = (user: string): string => {
		return createHex(user).toBuffer();
	}

	getStarted = (): number => {
		return this._startedAt;
	}

	// create a new message from the current state
	// the creation of new messages will be locked until the message is sent
	// if locked, undefined will be returned
	newMessage = (): ChatMessage => {
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
	sendMessage = (msg: ChatMessage) => {
		this._lastAt = Date.now();
		console.log("todo SEND: " + msg);
		this._ready = true;
	}

	// starts the retrieve and post loop after we know the user of the other party
	start = (userOther: string, secret: string): Promise<any> => { 
		let self = this;
		return new Promise((whohoo, doh) => {
			self._userOther = userOther;
			self._topicMe = getFeedTopic({
				name: self.userToTopic(self._userOther)
			});
			self._loop = setInterval(self._run, MSGPERIOD, self);
			whohoo();
		});
	}

	// make sure we have pings sent every period if no other message is in the process of being sent
	_run = (self: any) => {
		if (self._ready && Date.now() - self._lastAt > MSGPERIOD) {
			let msg = self.newMessage();
			self.sendMessage(msg);
		}
	}

	// teardown of chat session
	stop = (): Promise<any> => {
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
	bzz = (): any => {
		return this._bzz;
	}
}



// us
const keyPairSelf = createKeyPair();
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


function uploadToFeed(bz: any, user: string, topic: string, data: string): Promise<any> {

	const feedOptions = {
		user: user,
		topic: topic,
	}

	return new Promise((whohoo, doh) => {	
		console.log("uploading " + data);
		bz.upload(
			data, 
		).then(function(h) {
			console.log("data uploaded to " + h);
			bz.setFeedContentHash(feedOptions, h).then(function(r) {
				whohoo(h);
			}).catch(doh);;
		}).catch(doh);
	});
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

// Handle the handshake from the peer that responds to the invitation
function startRequest() {

	// BUG: why does signBytes have to be named "signBytes"? seems like scoping error below
	const signBytes = signerTmp;
	const bz = new BzzAPI({ url: GATEWAY_URL,  signBytes });

	// on success passes user address for peer
	return new Promise((whohoo, doh) => {
		uploadToFeed(bz, userTmp, topicTmp, keyPubSelf).then(function(myHash) {
			console.log("uploaded to " + myHash);
			publishResponseScript();
			let attempts = 0;
			const detectStart = setInterval(function() {
				console.log("check if started, attempt " + attempts);
				if (attempts > MAXCONNECTIONPOLLS) {
					clearInterval(detectStart);
					doh("timeout waiting for other side to respond");
				}
				downloadFromFeed(bz, userTmp, topicTmp).then(function(r) {
					const currentHash = r.url.substring(r.url.length-65, r.url.length-1);
					if (currentHash !== myHash) {
						r.text().then(function(handshakeOther) {
							// catch potential delayed stream reads
							if (keyPairOtherPub !== undefined) {
								return;
							}

							// stop the handshake poller
							clearInterval(detectStart);

							// set up the user info for the peer
							// and start the chat session with that info
							keyPairOtherPub = createPublic(handshakeOther.substring(0, 130));
							let secret = handshakeOther.substring(130, 130+64);
							userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
							chatSession.start(keyPairOtherPub, secret).then(function() {
								setTimeout(function() {
									chatSession.stop().then(function() {
										console.log("stopped");
									});
								}, 3000);
							});

							// share the good news
							whohoo(userOther);
						});
					}	
				});
				attempts++;
			}, MSGPERIOD);
		}).catch(function(e) {
			doh(e);
		});
	});
}

function startResponse() {

	// TODO: derive proper secret from own privkey
	const secret = ZEROHASH;

	// BUG: why does signBytes have to be named "signBytes"? seems like scoping error below
	const signBytes = signerTmp;
	const bz = new BzzAPI({ url: GATEWAY_URL,  signBytes });

	return new Promise((whohoo, doh) => {
		downloadFromFeed(bz, userTmp, topicTmp).then(function(r) {
			r.text().then(function(handshakePubOther) {
				// NB these are globalsss
				keyPairOtherPub = createPublic(handshakePubOther);
				userOther = pubKeyToAddress(createHex("0x" + keyPairOtherPub.getPublic('hex')));
				uploadToFeed(bz, userTmp, topicTmp, keyPubSelf + ZEROHASH).then(function(myHash) {
					chatSession.start(keyPairOtherPub, ZEROHASH).then(function() {
						setTimeout(function() {
							chatSession.stop().then(function() {
								console.log("stopped");
							});
						}, 3000);
					});
					whohoo(userOther);
				});
			}).catch(doh);
		}).catch(doh);
	});
}

if (keyTmpRequestPriv === undefined) {
	startRequest().then(function(v) {
		console.log("started request: " + v);
	}).catch(function(e) {
		console.error("error starting response: " + e);
	});
} else {
	startResponse().then(function(v) {
		console.log("started request: " + v);
	}).catch(function(e) {
		console.error("error starting response: " + e);
	});
}
