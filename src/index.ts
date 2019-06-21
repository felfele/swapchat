import { createHex, BzzAPI  } from '@erebos/swarm';
import { createKeyPair, createPublic, sign } from '@erebos/secp256k1'
import { pubKeyToAddress, hash } from '@erebos/keccak256'

var GATEWAY_URL = 'http://localhost:8500';

// yes, we use globalsss!
var keyTmpRequestPriv = "";
var keyOtherPub = "";


// us
var keyPairSelf = createKeyPair();
var userSelf = pubKeyToAddress(createHex("0x" + keyPairSelf.getPublic("hex")));
var signerSelf = async bytes => sign(bytes, keyPairSelf.getPrivate());


// the handshake feed 
var keyPairTmp = createKeyPair(keyTmpRequestPriv);
var keyTmpPub = keyPairTmp.getPublic("hex");
var userTmp = pubKeyToAddress(createHex("0x" + keyTmpPub));
var topicTmp = "0x";
// BUG: createHex doesn't work for the hash output, annoying!
var topicTmpArray = hash(Buffer.from(keyPairTmp.getPrivate("hex"))); 
topicTmpArray.forEach(function(k) {
	var s = "00" + Math.abs(k).toString(16);
	topicTmp += s.substring(s.length-2, s.length);
	
});
var signerTmp = async bytes => sign(bytes, keyPairTmp.getPrivate());
var bzr = new BzzAPI({ url: GATEWAY_URL });
// the peer
var keyPairOtherPub = undefined;
if (keyOtherPub != "") {
	keyPairOtherPub = createPublic(keyOtherPub);
}

console.log("topic: " + topicTmp);
console.log("user self: " + userSelf);
console.log("tmp priv: " + keyPairTmp.getPrivate("hex"));
console.log("pub self: " + keyPairSelf.getPublic("hex"));
console.log("user other: " + userSelf);

function uploadToFeed(user, signer, topic, data) {//user, topic, data) {

	// BUG: why does signBytes have to be named "signBytes"?
	var signBytes = signer;
	var bz = new BzzAPI({ url: GATEWAY_URL,  signBytes });
	var feedOptions = {
		user: user,
		topic: topic,
	}
	console.log(bz);
	
	return bz.setFeedContent(feedOptions, data);
}

function downloadFromFeed(user, topic) {
	var feedOptions = {
		user: user,
		topic: topic,
	}
	console.log(bzr);

	return bzr.getFeedContent(feedOptions, {
		mode: "raw",
	});
}

// Handle the handshake from the peer that responds to the invitation
function handshakeResponse() {
	return new Promise(function(whohoo, doh) {
		whohoo();
	});
}

function handshakeRequest() {
	return new Promise(function(whohoo, doh) {
		uploadToFeed(userTmp, signerTmp, topicTmp, keyPairTmp.getPrivate("hex")).then(function(k) {
			console.log("feed hash: " + k);
			downloadFromFeed(userTmp, topicTmp).then(function(e) {
				e.text().then(function(b) {
					whohoo(b);	
				});
			});
		});
	});
}

handshakeRequest().then(function(h) {
	console.log("ok:" + h);
});
