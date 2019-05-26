import { BzzAPI } from '@erebos/swarm';
import { createKeyPair, sign } from '@erebos/secp256k1'
import { pubKeyToAddress } from '@erebos/keccak256'

console.log(window.javascriptHash);

var topic = '';
var keyPairSelf = createKeyPair();
var keyPairTemp = createKeyPair();
var user = pubKeyToAddress(keyPairSelf.getPublic().encode())
var signBytes = async bytes => sign(bytes, keyPairSelf.getPrivate())
var bzz = new BzzAPI({ url: 'https://swarm-gateways.net', signBytes })
console.log(bzz)

function uploadToFeed(user, topic, data) {
    var feedOptions = {
        user,
        topic,
    }
    return bzz.uploadFeedValue(feedOptions, data)
}

function uploadPage() {
    const client = new Erebos.SwarmClient({
        http: 'https://swarm-gateways.net',
    })
    client.bzz
        .upload(`<body><html><script src="main.js"></script></html></body>`, { contentType: 'text/html' })
        .then(hash => client.bzz.download(hash))
        .then(res => res.text())
        .then(text => {
        console.log(text) // "Hello world!"
    })
}

uploadToFeed(user, topic, 'hello').then(function(hash) {
    console.log(hash);

})

