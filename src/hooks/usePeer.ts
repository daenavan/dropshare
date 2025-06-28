import Peer, { type DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";
import {
	arrayBufferToBase64,
	base64ToArrayBuffer,
	decryptData,
	deriveSharedKey,
	type EncryptedData,
	encryptData,
	exportPublicKey,
	generateChallenge,
	generateKeyPair,
	generateSigningKeyPair,
	importPublicKey,
	type KeyPair,
	signChallenge,
	verifyChallenge,
} from "@/lib/crypto";

// Represents a connected peer (receiver)
export interface ConnectedPeer {
	id: string;
	name: string;
	connection: DataConnection;
	isVerified: boolean;
	sharedKey?: Uint8Array;
}

// Represents a file staged for sharing
export interface SharedFile {
	file: File;
	id: string;
}

// Message types for peer communication
export type PeerMessage =
	| { type: "HELLO"; name: string }
	| { type: "KEY_EXCHANGE"; dhPublicKey: string; signingPublicKey: string }
	| { type: "CHALLENGE"; challenge: string }
	| { type: "CHALLENGE_RESPONSE"; signature: string }
	| { type: "VERIFICATION_COMPLETE" }
	| { type: "DISCONNECTED" }
	| {
			type: "FILES_UPDATE";
			files: Array<{ id: string; name: string; size: number }>;
	  }
	| { type: "REQUEST_FILE"; fileId: string }
	| {
			type: "FILE_METADATA";
			fileId: string;
			name: string;
			size: string;
			totalChunks: number;
			encrypted: boolean;
	  }
	| {
			type: "FILE_CHUNK";
			fileId: string;
			chunkIndex: number;
			data: ArrayBuffer;
			isLast: boolean;
			encrypted: boolean;
			iv?: string;
	  };

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export function usePeer() {
	const [peerId, setPeerId] = useState<string | null>(null);
	const [isSender, setIsSender] = useState<boolean>(false);
	const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
	const [connectedPeers, setConnectedPeers] = useState<ConnectedPeer[]>([]);
	const [receivedFiles, setReceivedFiles] = useState<
		Array<{ id: string; name: string; size: number }>
	>([]);
	const [downloadProgress, setDownloadProgress] = useState<
		Record<string, number>
	>({});
	const [isConnected, setIsConnected] = useState<boolean>(false);
	const [connectionStatus, setConnectionStatus] = useState<
		"connecting" | "verifying" | "connected" | "error" | "disconnected"
	>("connecting");

	const peerRef = useRef<Peer | null>(null);
	const senderConnectionRef = useRef<DataConnection | null>(null);
	const downloadBuffersRef = useRef<
		Record<
			string,
			{ chunks: ArrayBuffer[]; metadata: { name: string; size: number } }
		>
	>({});

	// Crypto state
	const dhKeyPairRef = useRef<KeyPair | null>(null);
	const signingKeyPairRef = useRef<KeyPair | null>(null);
	const peerKeysRef = useRef<
		Record<
			string,
			{
				dhPublicKey: Uint8Array;
				signingPublicKey: Uint8Array;
				sharedKey?: Uint8Array;
			}
		>
	>({});
	const challengesRef = useRef<Record<string, ArrayBuffer>>({});

	const sendFileToReceiver = useCallback(
		async (sharedFile: SharedFile, conn: DataConnection) => {
			const { file, id } = sharedFile;
			const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
			const peerKeys = peerKeysRef.current[conn.peer];
			const useEncryption = peerKeys?.sharedKey !== undefined;

			// Send metadata first
			conn.send({
				type: "FILE_METADATA",
				fileId: id,
				name: file.name,
				size: file.size.toString(),
				totalChunks,
				encrypted: useEncryption,
			});

			// Send file in chunks
			for (let i = 0; i < totalChunks; i++) {
				const start = i * CHUNK_SIZE;
				const end = Math.min(start + CHUNK_SIZE, file.size);
				const chunk = file.slice(start, end);
				let arrayBuffer = await chunk.arrayBuffer();
				let iv: string | undefined;

				// Encrypt chunk if we have a shared key
				if (useEncryption && peerKeys?.sharedKey) {
					try {
						const encryptedData = await encryptData(
							arrayBuffer,
							peerKeys.sharedKey,
						);
						arrayBuffer = encryptedData.data;
						iv = arrayBufferToBase64(encryptedData.iv);
					} catch (error) {
						console.error("Failed to encrypt chunk:", error);
						// Fall back to unencrypted
						useEncryption &&
							console.warn("Falling back to unencrypted transmission");
					}
				}

				conn.send({
					type: "FILE_CHUNK",
					fileId: id,
					chunkIndex: i,
					data: arrayBuffer,
					isLast: i === totalChunks - 1,
					encrypted: useEncryption,
					iv,
				});

				// Small delay to prevent overwhelming the connection
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		},
		[],
	);

	const handlePeerMessage = useCallback(
		async (message: PeerMessage, conn: DataConnection) => {
			switch (message.type) {
				case "HELLO": {
					// A receiver connected and sent their name
					const newPeer: ConnectedPeer = {
						id: conn.peer,
						name: message.name,
						connection: conn,
						isVerified: false,
					};
					setConnectedPeers((prev) => [
						...prev.filter((p) => p.id !== conn.peer),
						newPeer,
					]);

					// Start key exchange process
					if (dhKeyPairRef.current && signingKeyPairRef.current) {
						const dhPublicKeyBuffer = exportPublicKey(
							dhKeyPairRef.current.publicKey,
						);
						const signingPublicKeyBuffer = exportPublicKey(
							signingKeyPairRef.current.publicKey,
						);

						conn.send({
							type: "KEY_EXCHANGE",
							dhPublicKey: arrayBufferToBase64(dhPublicKeyBuffer),
							signingPublicKey: arrayBufferToBase64(signingPublicKeyBuffer),
						});
					}
					break;
				}

				case "KEY_EXCHANGE": {
					try {
						// Import peer's public keys
						const dhPublicKeyBuffer = base64ToArrayBuffer(message.dhPublicKey);
						const signingPublicKeyBuffer = base64ToArrayBuffer(
							message.signingPublicKey,
						);

						const peerDhPublicKey = importPublicKey(dhPublicKeyBuffer);
						const peerSigningPublicKey = importPublicKey(
							signingPublicKeyBuffer,
						);

						// Store peer's keys
						peerKeysRef.current[conn.peer] = {
							dhPublicKey: peerDhPublicKey,
							signingPublicKey: peerSigningPublicKey,
						};

						// Derive shared key if we have our DH key pair
						if (dhKeyPairRef.current) {
							const sharedKey = deriveSharedKey(
								dhKeyPairRef.current.privateKey,
								peerDhPublicKey,
							);
							peerKeysRef.current[conn.peer].sharedKey = sharedKey;
						}

						// Send our public keys back if this is a receiver
						if (
							!isSender &&
							dhKeyPairRef.current &&
							signingKeyPairRef.current
						) {
							const dhPublicKeyBuffer = exportPublicKey(
								dhKeyPairRef.current.publicKey,
							);
							const signingPublicKeyBuffer = exportPublicKey(
								signingKeyPairRef.current.publicKey,
							);

							conn.send({
								type: "KEY_EXCHANGE",
								dhPublicKey: arrayBufferToBase64(dhPublicKeyBuffer),
								signingPublicKey: arrayBufferToBase64(signingPublicKeyBuffer),
							});
						}

						// Start challenge-response verification
						const challenge = generateChallenge();
						challengesRef.current[conn.peer] = challenge;

						conn.send({
							type: "CHALLENGE",
							challenge: arrayBufferToBase64(challenge),
						});
					} catch (error) {
						console.error("Key exchange failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "CHALLENGE": {
					try {
						const challenge = base64ToArrayBuffer(message.challenge);

						if (signingKeyPairRef.current) {
							const signature = await signChallenge(
								challenge,
								signingKeyPairRef.current.privateKey,
							);

							conn.send({
								type: "CHALLENGE_RESPONSE",
								signature: arrayBufferToBase64(signature),
							});
						}
					} catch (error) {
						console.error("Challenge signing failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "CHALLENGE_RESPONSE": {
					try {
						const signature = base64ToArrayBuffer(message.signature);
						const challenge = challengesRef.current[conn.peer];
						const peerKeys = peerKeysRef.current[conn.peer];

						if (challenge && peerKeys?.signingPublicKey) {
							const isValid = await verifyChallenge(
								challenge,
								signature,
								peerKeys.signingPublicKey,
							);

							if (isValid) {
								// Mark peer as verified
								setConnectedPeers((prev) =>
									prev.map((peer) =>
										peer.id === conn.peer
											? {
													...peer,
													isVerified: true,
													sharedKey: peerKeys.sharedKey,
												}
											: peer,
									),
								);

								conn.send({ type: "VERIFICATION_COMPLETE" });
								setConnectionStatus("connected");

								// Send current files to the verified receiver
								setSharedFiles((currentFiles) => {
									const fileManifest = currentFiles.map((sf) => ({
										id: sf.id,
										name: sf.file.name,
										size: sf.file.size,
									}));
									conn.send({ type: "FILES_UPDATE", files: fileManifest });
									return currentFiles;
								});
							} else {
								console.error("Challenge verification failed");
								setConnectionStatus("error");
							}

							// Cleanup challenge
							delete challengesRef.current[conn.peer];
						}
					} catch (error) {
						console.error("Challenge verification failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "VERIFICATION_COMPLETE": {
					setConnectionStatus("connected");
					setIsConnected(true);
					break;
				}

				case "DISCONNECTED": {
					if (senderConnectionRef.current) {
						senderConnectionRef.current.close();
					}
					setConnectionStatus("disconnected");
					setIsConnected(false);
					break;
				}

				case "FILES_UPDATE":
					// Received file list from sender
					setReceivedFiles(message.files);
					break;

				case "REQUEST_FILE": {
					// A receiver wants to download a file
					setSharedFiles((currentFiles) => {
						const fileToSend = currentFiles.find(
							(sf) => sf.id === message.fileId,
						);
						if (fileToSend) {
							sendFileToReceiver(fileToSend, conn);
						}
						return currentFiles;
					});
					break;
				}

				case "FILE_METADATA":
					// Receiving file metadata
					downloadBuffersRef.current[message.fileId] = {
						chunks: new Array(message.totalChunks),
						metadata: { name: message.name, size: parseInt(message.size) },
					};
					setDownloadProgress((prev) => ({ ...prev, [message.fileId]: 0 }));
					break;

				case "FILE_CHUNK": {
					// Receiving file chunk
					const fileBuffer = downloadBuffersRef.current[message.fileId];
					if (fileBuffer) {
						// Ensure we don't process the same chunk twice
						if (fileBuffer.chunks[message.chunkIndex] === undefined) {
							let chunkData = message.data;

							// Decrypt chunk if it's encrypted
							if (
								message.encrypted &&
								message.iv &&
								senderConnectionRef.current
							) {
								const peerKeys =
									peerKeysRef.current[senderConnectionRef.current.peer];
								if (peerKeys?.sharedKey) {
									try {
										const encryptedData: EncryptedData = {
											data: message.data,
											iv: base64ToArrayBuffer(message.iv),
										};
										chunkData = await decryptData(
											encryptedData,
											peerKeys.sharedKey,
										);
									} catch (error) {
										console.error("Failed to decrypt chunk:", error);
										// Use encrypted data as fallback (will likely be corrupted)
									}
								}
							}

							fileBuffer.chunks[message.chunkIndex] = chunkData;
						}

						const received = fileBuffer.chunks.filter(
							(chunk) => chunk !== undefined,
						).length;
						const progress = (received / fileBuffer.chunks.length) * 100;
						setDownloadProgress((prev) => ({
							...prev,
							[message.fileId]: progress,
						}));

						// If all chunks are received, assemble and download the file
						if (received === fileBuffer.chunks.length) {
							const completeFile = new Blob(fileBuffer.chunks);
							const url = URL.createObjectURL(completeFile);
							const a = document.createElement("a");
							a.href = url;
							a.download = fileBuffer.metadata.name;
							document.body.appendChild(a); // Append for browser compatibility
							a.click();
							URL.revokeObjectURL(url);
							a.remove();

							// Cleanup
							delete downloadBuffersRef.current[message.fileId];
							setDownloadProgress((prev) => {
								const newProgress = { ...prev };
								delete newProgress[message.fileId];
								return newProgress;
							});
						}
					}
					break;
				}
			}
		},
		[sendFileToReceiver, isSender],
	);

	// Initialize crypto keys
	useEffect(() => {
		const initializeCrypto = () => {
			try {
				dhKeyPairRef.current = generateKeyPair();
				signingKeyPairRef.current = generateSigningKeyPair();
			} catch (error) {
				console.error("Failed to initialize crypto keys:", error);
			}
		};

		initializeCrypto();
	}, []);

	// Initialize PeerJS
	useEffect(() => {
		const peer = new Peer({
			config: {
				iceServers: [
					// Google's free STUN servers
					{ urls: "stun:stun.l.google.com:19302" },
					{ urls: "stun:stun1.l.google.com:19302" },
					{ urls: "stun:stun2.l.google.com:19302" },
					{ urls: "stun:stun3.l.google.com:19302" },
					{ urls: "stun:stun4.l.google.com:19302" },
				],
			},
		});
		peerRef.current = peer;

		peer.on("open", (id) => {
			setPeerId(id);
		});

		peer.on("connection", (conn) => {
			const handleDisconnect = () => {
				setConnectedPeers((prev) => prev.filter((p) => p.id !== conn.peer));
			};

			conn.on("open", () => {
				// Wait for hello message to get the peer's name
			});

			conn.on("data", (data) => {
				handlePeerMessage(data as PeerMessage, conn);
			});

			conn.on("close", handleDisconnect);
			conn.on("error", handleDisconnect);
		});

		peer.on("error", (error) => {
			console.error("PeerJS error:", error);
		});

		return () => {
			peer.destroy();
		};
	}, [handlePeerMessage]);

	const addFiles = useCallback((files: File[]) => {
		const newSharedFiles = files.map((file) => ({
			file,
			id: crypto.randomUUID(),
		}));

		setSharedFiles((prev) => {
			const updatedFiles = [...prev, ...newSharedFiles];
			setIsSender(true);

			// Broadcast updated file list to all connected receivers
			const fileManifest = updatedFiles.map((sf) => ({
				id: sf.id,
				name: sf.file.name,
				size: sf.file.size,
			}));

			setConnectedPeers((currentPeers) => {
				currentPeers.forEach((peer) => {
					peer.connection.send({ type: "FILES_UPDATE", files: fileManifest });
				});
				return currentPeers;
			});

			return updatedFiles;
		});
	}, []);

	const connectToSender = useCallback(
		(senderId: string) => {
			if (!peerRef.current) return;

			const conn = peerRef.current.connect(senderId);
			senderConnectionRef.current = conn;

			conn.on("open", () => {
				setConnectionStatus("verifying");
				setIsSender(false);

				// Generate a unique name for this receiver
				const receiverName = uniqueNamesGenerator({
					dictionaries: [adjectives, animals],
					separator: "-",
					style: "capital",
				});

				// Send hello message with our name
				conn.send({ type: "HELLO", name: receiverName });
			});

			conn.on("data", (data) => {
				handlePeerMessage(data as PeerMessage, conn);
			});

			const handleDisconnect = () => {
				setIsConnected(false);
				setReceivedFiles([]);
			};

			conn.on("close", handleDisconnect);
			conn.on("error", handleDisconnect);
		},
		[handlePeerMessage],
	);

	const requestFile = useCallback((fileId: string) => {
		if (senderConnectionRef.current) {
			senderConnectionRef.current.send({ type: "REQUEST_FILE", fileId });
		}
	}, []);

	const removePeer = useCallback((peerId: string) => {
		setConnectedPeers((currentPeers) => {
			const peerToRemove = currentPeers.find((p) => p.id === peerId);
			if (peerToRemove) {
				peerToRemove.connection.send({ type: "DISCONNECTED" });
				// Give a moment for the message to be sent before closing
				setTimeout(() => {
					peerToRemove.connection.close();
				}, 100);
			}
			return currentPeers.filter((p) => p.id !== peerId);
		});
	}, []);

	const removeFile = useCallback((fileId: string) => {
		setSharedFiles((prev) => {
			const updatedFiles = prev.filter((sf) => sf.id !== fileId);

			// Broadcast updated file list to all connected receivers
			const fileManifest = updatedFiles.map((sf) => ({
				id: sf.id,
				name: sf.file.name,
				size: sf.file.size,
			}));

			setConnectedPeers((currentPeers) => {
				currentPeers.forEach((peer) => {
					peer.connection.send({ type: "FILES_UPDATE", files: fileManifest });
				});
				return currentPeers;
			});

			return updatedFiles;
		});
	}, []);

	return {
		peerId,
		isSender,
		sharedFiles,
		connectedPeers,
		receivedFiles,
		downloadProgress,
		isConnected,
		connectionStatus,
		addFiles,
		connectToSender,
		requestFile,
		removeFile,
		removePeer,
	};
}
