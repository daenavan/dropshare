import { gcm } from "@noble/ciphers/aes";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import {
	bytesToHex,
	bytesToUtf8,
	hexToBytes,
	utf8ToBytes,
} from "@noble/hashes/utils";

// Crypto utilities for secure P2P communication using Noble libraries
export interface KeyPair {
	publicKey: Uint8Array;
	privateKey: Uint8Array;
}

export interface EncryptedData {
	data: ArrayBuffer;
	iv: ArrayBuffer;
}

export interface ConnectionChallenge {
	challenge: ArrayBuffer;
	signature: ArrayBuffer;
}

// Generate ECDH-compatible key pair for key exchange
export function generateKeyPair(): KeyPair {
	const privateKey = secp256k1.utils.randomPrivateKey();
	const publicKey = secp256k1.getPublicKey(privateKey);
	return { privateKey, publicKey };
}

// Generate signing key pair for connection verification
export function generateSigningKeyPair(): KeyPair {
	const privateKey = secp256k1.utils.randomPrivateKey();
	const publicKey = secp256k1.getPublicKey(privateKey);
	return { privateKey, publicKey };
}

// Export public key to ArrayBuffer for transmission
export function exportPublicKey(publicKey: Uint8Array): ArrayBuffer {
	return publicKey.buffer;
}

// Import public key from ArrayBuffer
export function importPublicKey(keyData: ArrayBuffer): Uint8Array {
	return new Uint8Array(keyData);
}

// Derive shared AES key from our private key and peer's public key
export function deriveSharedKey(
	privateKey: Uint8Array,
	peerPublicKey: Uint8Array,
): Uint8Array {
	const sharedPoint = secp256k1.getSharedSecret(privateKey, peerPublicKey);
	// Use HKDF to derive a 32-byte key from the shared secret
	return hkdf(sha256, sharedPoint, undefined, "dropshare", 32);
}

// Encrypt data using AES-GCM
export async function encryptData(
	data: ArrayBuffer,
	key: Uint8Array,
): Promise<EncryptedData> {
	const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
	const aes = gcm(key, iv);
	const encryptedData = aes.encrypt(new Uint8Array(data));

	return {
		data: encryptedData.buffer,
		iv: iv.buffer,
	};
}

// Decrypt data using AES-GCM
export async function decryptData(
	encryptedData: EncryptedData,
	key: Uint8Array,
): Promise<ArrayBuffer> {
	const aes = gcm(key, new Uint8Array(encryptedData.iv));
	const decryptedData = aes.decrypt(new Uint8Array(encryptedData.data));
	return decryptedData.buffer;
}

// Generate a random challenge for connection verification
export function generateChallenge(): ArrayBuffer {
	return crypto.getRandomValues(new Uint8Array(32)).buffer;
}

// Sign a challenge with private key
export async function signChallenge(
	challenge: ArrayBuffer,
	privateKey: Uint8Array,
): Promise<ArrayBuffer> {
	const hash = sha256(new Uint8Array(challenge));
	const signature = secp256k1.sign(hash, privateKey);
	return signature.toCompactRawBytes().buffer;
}

// Verify a signed challenge with public key
export async function verifyChallenge(
	challenge: ArrayBuffer,
	signature: ArrayBuffer,
	publicKey: Uint8Array,
): Promise<boolean> {
	try {
		const hash = sha256(new Uint8Array(challenge));
		const sig = secp256k1.Signature.fromCompact(new Uint8Array(signature));
		return secp256k1.verify(sig, hash, publicKey);
	} catch {
		return false;
	}
}

// Convert ArrayBuffer to base64 string for JSON serialization
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return bytesToHex(new Uint8Array(buffer));
}

// Convert base64 string back to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	return hexToBytes(base64).buffer;
}

// Utility to convert string to ArrayBuffer
export function stringToArrayBuffer(str: string): ArrayBuffer {
	return utf8ToBytes(str).buffer;
}

// Utility to convert ArrayBuffer to string
export function arrayBufferToString(buffer: ArrayBuffer): string {
	return bytesToUtf8(new Uint8Array(buffer));
}
