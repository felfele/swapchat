import { createPublic, sign } from '@erebos/secp256k1';
import { pubKeyToAddress, hash } from '@erebos/keccak256';

class Signer {
	signer: any;
	privateKey: string;
	publicKey: any;
	address: any;

	// privatekey from hex
	constructor(keyPair:any) {
		this.privateKey = keyPair.getPrivate();
		this.publicKey = keyPair.getPublic();
		this.signer = sign;
		//this.publicKey = createPublic(privateKey);
		//this.publicKey = Uint8Array.from(publicKeyBuffer);
		this.address = pubKeyToAddress(this.publicKey);

	}

	public getAddress() {
		return this.address;
	}

	// TODO: protect type
	public sign(bytes:any) {
		
		//hasher = keccak('keccak256');
		//hasher.update(publicKeyBuffer);
		//let bzzKeyBuffer = hasher.digest();
		//this.bzzkey = Uint8Array.from(bzzKeyBuffer);

		return this.signer(bytes, this.privateKey);
	}
}

export { Signer };
