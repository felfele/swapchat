import * as ec from 'eccrypto'; // TODO: move derive to wallet
import * as keccak from 'keccak';

export const encryptAesGcm = async (message: string, secret: Uint8Array): Promise<Uint8Array> => {
	try {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const data = new TextEncoder().encode(message);
		const secretKey = await crypto.subtle.importKey('raw', secret, 'AES-GCM', true, ['encrypt', 'decrypt']);
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

export const decryptAesGcm = async (encryptedData: Uint8Array, secret: Uint8Array): Promise<string> => {
	try {
		const iv = encryptedData.slice(0, 12);
		const ciphertext = encryptedData.slice(12);
		const secretKey = await crypto.subtle.importKey('raw', secret, 'AES-GCM', true, ['encrypt', 'decrypt']);
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
export function hash(data):Uint8Array {
	const h = keccak('keccak256');
	h.update(Buffer.from(data));
	return new Uint8Array(h.digest());
}

export async function derive(priv, pub) {
	console.debug('derive', priv, pub);
	const secretBuffer = await ec.derive(Buffer.from(priv), Buffer.from(pub));
	return new Uint8Array(secretBuffer);
}
