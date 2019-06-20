import { BzzAPI } from '@erebos/swarm';
import { createKeyPair, sign } from '@erebos/secp256k1'
import { pubKeyToAddress } from '@erebos/keccak256'

var keyPairSelf = createKeyPair();
var keyPairTemp = createKeyPair();
var pubkey = keyPairSelf.getPublic();
var pubkeyHex = pubkey.encode("hex", false);
//var user = pubKeyToAddress(pubkeyHex);
var signBytes = async bytes => sign(bytes, keyPairSelf.getPrivate());
var bzz = new BzzAPI({ url: 'https://swarm-gateways.net', signBytes });
console.log(signBytes);
console.log(bzz);

export function uploadToFeed(topic, data) {//user, topic, data) {
	var feedOptions = {
//		user,
		topic,
	}
	return bzz.uploadFeedValue(feedOptions, data)
}

