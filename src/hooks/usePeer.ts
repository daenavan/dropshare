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
	signChallenge,
	verifyChallenge,
} from "@/lib/crypto";
import {
	applyIceServers,
	buildIceServers,
	connectionErrorMessage,
	connectionHint,
	ensureTurnServer,
} from "@/lib/peerConfig";
import { type PeerKeys, usePeerStore } from "@/store/peerStore";

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
	| {
			type: "KEY_EXCHANGE_RESPONSE";
			dhPublicKey: string;
			signingPublicKey: string;
	  }
	| { type: "CHALLENGE"; challenge: string }
	| { type: "CHALLENGE_RESPONSE"; signature: string }
	| { type: "VERIFICATION_COMPLETE" }
	| { type: "VERIFICATION_FAILED" }
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

// How long a connection may take to open before the user is told it failed.
const CONNECT_TIMEOUT_MS = 20000;
// How long the security handshake may take once the connection is open.
const HANDSHAKE_TIMEOUT_MS = 15000;
// How long to wait for our own signalling socket before giving up.
const PEER_READY_TIMEOUT_MS = 12000;
// Grace period before an interrupted ("disconnected") link is called lost.
const ICE_LOST_GRACE_MS = 8000;

type ConnectionStatus =
	| "connecting"
	| "verifying"
	| "connected"
	| "error"
	| "disconnected";

interface ConnectionAttempt {
	senderId: string;
	canceled: boolean;
	connection: DataConnection | null;
	connectTimer: ReturnType<typeof setTimeout> | null;
	handshakeTimer: ReturnType<typeof setTimeout> | null;
}

export function usePeer() {
	const [peerId, setPeerId] = useState<string | null>(null);
	const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
	const [connectedPeers, setConnectedPeers] = useState<ConnectedPeer[]>([]);
	const [receivedFiles, setReceivedFiles] = useState<
		Array<{ id: string; name: string; size: number }>
	>([]);
	const [downloadProgress, setDownloadProgress] = useState<
		Record<string, number>
	>({});
	const [isConnected, setIsConnected] = useState<boolean>(false);
	const [connectionStatus, setConnectionStatus] =
		useState<ConnectionStatus>("connecting");
	const [connectionError, setConnectionError] = useState<string | null>(null);
	// Sender side: false while we have no signalling socket (the QR may be stale).
	const [isSignalingConnected, setIsSignalingConnected] = useState(false);
	const [signalingError, setSignalingError] = useState<string | null>(null);

	const peerRef = useRef<Peer | null>(null);
	// Lets connectToSender() spin up a replacement peer if the socket died.
	const createPeerRef = useRef<(() => Peer) | null>(null);
	// The in-flight connection attempt, so retries/failures can cancel it.
	const attemptRef = useRef<ConnectionAttempt | null>(null);
	// Remembered so "Retry" can reconnect to the same sender.
	const lastSenderIdRef = useRef<string | null>(null);
	const handlePeerMessageRef = useRef<
		((message: PeerMessage, conn: DataConnection) => void) | null
	>(null);
	const downloadBuffersRef = useRef<
		Record<
			string,
			{ chunks: ArrayBuffer[]; metadata: { name: string; size: number } }
		>
	>({});

	// Crypto and state management from Zustand
	const {
		isSender,
		setIsSender,
		setCryptoKeys,
		addPeerKeys,
		updatePeerSharedKey,
		addChallenge,
		removeChallenge,
		setSenderConnection,
	} = usePeerStore();

	const sendFileToReceiver = useCallback(
		async (sharedFile: SharedFile, conn: DataConnection) => {
			const { file, id } = sharedFile;
			const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
			const sharedKey = usePeerStore.getState().peerKeys[conn.peer]?.sharedKey;

			// Fail closed: file chunks are only ever sent AES-GCM encrypted, so
			// refuse the transfer instead of putting plaintext on the wire.
			if (!sharedKey) {
				console.error(
					"Refusing to send a file without a shared encryption key",
				);
				return;
			}

			// Send metadata first
			conn.send({
				type: "FILE_METADATA",
				fileId: id,
				name: file.name,
				size: file.size.toString(),
				totalChunks,
				encrypted: true,
			});

			// Send file in chunks
			for (let i = 0; i < totalChunks; i++) {
				const start = i * CHUNK_SIZE;
				const end = Math.min(start + CHUNK_SIZE, file.size);
				const chunk = file.slice(start, end);
				const arrayBuffer = await chunk.arrayBuffer();

				try {
					const encryptedData = await encryptData(arrayBuffer, sharedKey);
					conn.send({
						type: "FILE_CHUNK",
						fileId: id,
						chunkIndex: i,
						data: encryptedData.data,
						isLast: i === totalChunks - 1,
						encrypted: true,
						iv: arrayBufferToBase64(encryptedData.iv),
					});
				} catch (error) {
					console.error("Failed to encrypt chunk, aborting transfer:", error);
					return;
				}

				// Small delay to prevent overwhelming the connection
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		},
		[],
	);

	const handlePeerMessage = useCallback(
		async (message: PeerMessage, conn: DataConnection) => {
			// Get latest state directly from the store to prevent stale closures
			const {
				dhKeyPair,
				signingKeyPair,
				peerKeys,
				challenges,
				senderConnection,
			} = usePeerStore.getState();

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
					if (dhKeyPair && signingKeyPair) {
						const dhPublicKeyBuffer = exportPublicKey(dhKeyPair.publicKey);
						const signingPublicKeyBuffer = exportPublicKey(
							signingKeyPair.publicKey,
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
						// This is received by the receiver from the sender.
						// The receiver should import the sender's keys and send its own back.

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
						const newPeerKeys: PeerKeys = {
							dhPublicKey: peerDhPublicKey,
							signingPublicKey: peerSigningPublicKey,
						};
						addPeerKeys(conn.peer, newPeerKeys);

						// Derive shared key
						if (dhKeyPair) {
							const sharedKey = deriveSharedKey(
								dhKeyPair.privateKey,
								peerDhPublicKey,
							);
							updatePeerSharedKey(conn.peer, sharedKey);
						}

						// Send our keys back to the sender
						if (dhKeyPair && signingKeyPair) {
							const dhPublicKeyBuffer = exportPublicKey(dhKeyPair.publicKey);
							const signingPublicKeyBuffer = exportPublicKey(
								signingKeyPair.publicKey,
							);

							conn.send({
								type: "KEY_EXCHANGE_RESPONSE",
								dhPublicKey: arrayBufferToBase64(dhPublicKeyBuffer),
								signingPublicKey: arrayBufferToBase64(signingPublicKeyBuffer),
							});
						}
					} catch (error) {
						console.error("Key exchange failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "KEY_EXCHANGE_RESPONSE": {
					try {
						// This is received by the sender from the receiver.
						// The sender should import keys and then initiate the challenge.

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
						const newPeerKeys: PeerKeys = {
							dhPublicKey: peerDhPublicKey,
							signingPublicKey: peerSigningPublicKey,
						};
						addPeerKeys(conn.peer, newPeerKeys);

						// Derive shared key
						if (dhKeyPair) {
							const sharedKey = deriveSharedKey(
								dhKeyPair.privateKey,
								peerDhPublicKey,
							);
							updatePeerSharedKey(conn.peer, sharedKey);
						}

						// Initiate the challenge
						const challenge = generateChallenge();
						addChallenge(conn.peer, challenge);

						conn.send({
							type: "CHALLENGE",
							challenge: arrayBufferToBase64(challenge),
						});
					} catch (error) {
						console.error("Key exchange response failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "CHALLENGE": {
					try {
						const challenge = base64ToArrayBuffer(message.challenge);

						if (signingKeyPair) {
							const signature = await signChallenge(
								challenge,
								signingKeyPair.privateKey,
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
						const challenge = challenges[conn.peer];
						const currentPeerKeys = peerKeys[conn.peer];

						if (challenge && currentPeerKeys?.signingPublicKey) {
							const isValid = await verifyChallenge(
								challenge,
								signature,
								currentPeerKeys.signingPublicKey,
							);

							if (isValid) {
								// Mark peer as verified
								setConnectedPeers((prev) =>
									prev.map((peer) =>
										peer.id === conn.peer
											? {
													...peer,
													isVerified: true,
													sharedKey: currentPeerKeys.sharedKey,
												}
											: peer,
									),
								);

								conn.send({ type: "VERIFICATION_COMPLETE" });

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
								// Let the receiver know instead of leaving it verifying forever
								conn.send({ type: "VERIFICATION_FAILED" });
							}

							// Cleanup challenge
							removeChallenge(conn.peer);
						}
					} catch (error) {
						console.error("Challenge verification failed:", error);
						setConnectionStatus("error");
					}
					break;
				}

				case "VERIFICATION_COMPLETE": {
					const attempt = attemptRef.current;
					if (attempt?.handshakeTimer) {
						clearTimeout(attempt.handshakeTimer);
						attempt.handshakeTimer = null;
					}
					setConnectionError(null);
					setConnectionStatus("connected");
					setIsConnected(true);
					break;
				}

				case "VERIFICATION_FAILED": {
					setConnectionStatus("error");
					setConnectionError(
						"The security check with the sender failed. Please connect again.",
					);
					break;
				}

				case "DISCONNECTED": {
					if (senderConnection) {
						senderConnection.close();
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
						metadata: {
							name: message.name,
							size: Number.parseInt(message.size),
						},
					};
					setDownloadProgress((prev) => ({ ...prev, [message.fileId]: 0 }));
					break;

				case "FILE_CHUNK": {
					// Receiving file chunk
					const fileBuffer = downloadBuffersRef.current[message.fileId];
					if (fileBuffer) {
						// Ensure we don't process the same chunk twice
						if (fileBuffer.chunks[message.chunkIndex] === undefined) {
							const sharedKey =
								usePeerStore.getState().peerKeys[
									usePeerStore.getState().senderConnection?.peer || ""
								]?.sharedKey;

							// Senders always encrypt chunks with AES-GCM, which also
							// authenticates them: an unencrypted or corrupted chunk is
							// refused instead of being saved as if it were file data.
							if (!message.encrypted || !message.iv || !sharedKey) {
								console.error(
									"Refusing an unencrypted or unverifiable file chunk",
								);
							} else {
								try {
									const encryptedData: EncryptedData = {
										data: message.data,
										iv: base64ToArrayBuffer(message.iv),
									};
									fileBuffer.chunks[message.chunkIndex] = await decryptData(
										encryptedData,
										sharedKey,
									);
								} catch (error) {
									console.error("Failed to decrypt chunk:", error);
								}
							}
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
		[
			sendFileToReceiver,
			addPeerKeys,
			updatePeerSharedKey,
			addChallenge,
			removeChallenge,
		],
	);

	// Keep the peer's message handler current without re-creating the peer.
	useEffect(() => {
		handlePeerMessageRef.current = handlePeerMessage;
	}, [handlePeerMessage]);

	// Initialize crypto keys
	useEffect(() => {
		const initializeCrypto = () => {
			try {
				const dhKeyPair = generateKeyPair();
				const signingKeyPair = generateSigningKeyPair();
				setCryptoKeys(dhKeyPair, signingKeyPair);
			} catch (error) {
				console.error("Failed to initialize crypto keys:", error);
			}
		};

		initializeCrypto();
	}, [setCryptoKeys]);

	// Initialize PeerJS. The signalling socket lives longer than a page view on
	// phones and tablets: it drops when the device sleeps or the tab is
	// throttled, which used to leave a stale QR code on screen and receivers
	// stuck on "connecting". Reconnect in place, and re-create the peer (new id,
	// so the QR code refreshes by itself) only when the socket is gone for good.
	useEffect(() => {
		let recreateTimer: ReturnType<typeof setTimeout> | null = null;
		let recreateAttempts = 0;
		let generation = 0;
		let disposed = false;

		const scheduleRecreate = () => {
			if (disposed || recreateTimer) return;
			recreateAttempts += 1;
			const delay = Math.min(2000 * 2 ** (recreateAttempts - 1), 30000);
			console.info(
				`Signalling server unavailable, retrying in ${delay}ms (attempt ${recreateAttempts})`,
			);
			recreateTimer = setTimeout(() => {
				recreateTimer = null;
				createPeer();
			}, delay);
		};

		const failActiveAttempt = (message: string) => {
			const attempt = attemptRef.current;
			if (!attempt || attempt.canceled) return;
			attempt.canceled = true;
			if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
			if (attempt.handshakeTimer) clearTimeout(attempt.handshakeTimer);
			attempt.connection?.close();
			attemptRef.current = null;
			setConnectionStatus("error");
			setConnectionError(message);
		};

		const createPeer = (): Peer => {
			// Bumping the generation first retires the previous peer's handlers:
			// destroy() fires its "close" event, which would otherwise look like a
			// lost socket and re-create peers in a loop.
			const myGeneration = ++generation;
			const isCurrent = () => generation === myGeneration && !disposed;

			const previous = peerRef.current;
			if (previous && !previous.destroyed) previous.destroy();

			const peer = new Peer({
				config: { iceServers: buildIceServers() },
			});
			peerRef.current = peer;

			// Relay credentials arrive asynchronously; apply them once they do so
			// that connections opened afterwards can fall back to the relay.
			void ensureTurnServer().then(() => {
				if (isCurrent()) applyIceServers(peer);
			});

			peer.on("open", (id) => {
				if (!isCurrent()) return;
				recreateAttempts = 0;
				setPeerId(id);
				setIsSignalingConnected(true);
				setSignalingError(null);
			});

			peer.on("connection", (conn) => {
				if (!isCurrent()) return;

				const handleDisconnect = () => {
					setConnectedPeers((prev) => prev.filter((p) => p.id !== conn.peer));
				};

				conn.on("open", () => {
					// Wait for hello message to get the peer's name
				});

				conn.on("data", (data) => {
					handlePeerMessageRef.current?.(data as PeerMessage, conn);
				});

				conn.on("close", handleDisconnect);
				conn.on("error", handleDisconnect);
			});

			peer.on("disconnected", () => {
				if (!isCurrent()) return;
				setIsSignalingConnected(false);
				// Keep the same id so the QR code on screen stays valid
				try {
					peer.reconnect();
				} catch (error) {
					console.error("Failed to reconnect to the signalling server:", error);
					scheduleRecreate();
				}
			});

			peer.on("close", () => {
				if (!isCurrent()) return;
				setIsSignalingConnected(false);
				scheduleRecreate();
			});

			peer.on("error", (error) => {
				if (!isCurrent()) return;
				console.error("PeerJS error:", error);
				const type = (error as { type?: string }).type;

				switch (type) {
					case "peer-unavailable":
						// Only the receiver creates outgoing connections
						failActiveAttempt(connectionErrorMessage(error));
						break;
					case "unavailable-id":
						// Someone else took the id: get a new one (and a new QR code)
						console.warn("Peer id unavailable, requesting a new one");
						setIsSignalingConnected(false);
						scheduleRecreate();
						break;
					case "network":
					case "socket-error":
					case "socket-closed":
					case "server-error":
						setIsSignalingConnected(false);
						setSignalingError(
							"Lost connection to the connection service. Reconnecting…",
						);
						scheduleRecreate();
						break;
					case "browser-incompatible":
					case "webrtc":
					case "ssl-unavailable":
					case "invalid-key":
						setIsSignalingConnected(false);
						setSignalingError(connectionErrorMessage(error));
						break;
					default:
						break;
				}
			});

			return peer;
		};

		createPeerRef.current = createPeer;
		createPeer();

		// Phones and tablets suspend the socket while asleep or backgrounded.
		const wakeUp = () => {
			if (disposed || document.hidden) return;
			const peer = peerRef.current;
			if (!peer || peer.destroyed) {
				createPeer();
				return;
			}
			if (peer.disconnected) {
				try {
					peer.reconnect();
				} catch (error) {
					console.error("Failed to reconnect to the signalling server:", error);
					scheduleRecreate();
				}
			}
		};

		document.addEventListener("visibilitychange", wakeUp);
		window.addEventListener("online", wakeUp);
		window.addEventListener("focus", wakeUp);

		return () => {
			disposed = true;
			if (recreateTimer) clearTimeout(recreateTimer);
			document.removeEventListener("visibilitychange", wakeUp);
			window.removeEventListener("online", wakeUp);
			window.removeEventListener("focus", wakeUp);
			createPeerRef.current = null;
			peerRef.current?.destroy();
			peerRef.current = null;
		};
	}, []);

	const addFiles = useCallback(
		(files: File[]) => {
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
						peer.connection.send({
							type: "FILES_UPDATE",
							files: fileManifest,
						});
					});
					return currentPeers;
				});

				return updatedFiles;
			});
		},
		[setIsSender],
	);

	const cancelAttempt = useCallback(() => {
		const attempt = attemptRef.current;
		if (!attempt) return;
		attempt.canceled = true;
		if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
		if (attempt.handshakeTimer) clearTimeout(attempt.handshakeTimer);
		attempt.connection?.close();
		attemptRef.current = null;
	}, []);

	const failAttempt = useCallback(
		(attempt: ConnectionAttempt, message: string) => {
			if (attempt.canceled) return;
			attempt.canceled = true;
			if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
			if (attempt.handshakeTimer) clearTimeout(attempt.handshakeTimer);
			attempt.connection?.close();
			if (attemptRef.current === attempt) attemptRef.current = null;
			console.warn("Connection failed:", message);
			setConnectionStatus("error");
			setConnectionError(message);
		},
		[],
	);

	const waitForPeerOpen = useCallback(
		(peer: Peer, timeoutMs: number) =>
			new Promise<Peer | null>((resolve) => {
				if (peer.open) {
					resolve(peer);
					return;
				}

				let settled = false;
				const finish = (result: Peer | null) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					peer.off("open", handleOpen);
					resolve(result);
				};
				const handleOpen = () => finish(peer);
				const timer = setTimeout(() => finish(null), timeoutMs);
				peer.on("open", handleOpen);
			}),
		[],
	);

	/** Waits until our own signalling socket is usable, replacing it if needed. */
	const ensurePeerReady = useCallback(async () => {
		let peer = peerRef.current;

		if (!peer || peer.destroyed) {
			peer = createPeerRef.current?.() ?? null;
		}
		if (!peer) return null;

		if (peer.disconnected) {
			try {
				peer.reconnect();
			} catch (error) {
				console.error("Failed to reconnect to the signalling server:", error);
				peer = createPeerRef.current?.() ?? peer;
			}
		}

		return waitForPeerOpen(peer, PEER_READY_TIMEOUT_MS);
	}, [waitForPeerOpen]);

	const connectToSender = useCallback(
		async (senderId: string) => {
			if (!senderId) return;

			// Never stack attempts at the same sender: two connections to one peer
			// share the same key material and corrupt the handshake.
			const inFlight = attemptRef.current;
			if (inFlight && !inFlight.canceled && inFlight.senderId === senderId) {
				return;
			}
			cancelAttempt();
			lastSenderIdRef.current = senderId;

			setConnectionError(null);
			setConnectionStatus("connecting");

			const attempt: ConnectionAttempt = {
				senderId,
				canceled: false,
				connection: null,
				connectTimer: null,
				handshakeTimer: null,
			};
			attemptRef.current = attempt;

			const peer = await ensurePeerReady();
			if (attempt.canceled) return;
			if (!peer) {
				failAttempt(
					attempt,
					"Could not reach the connection service (0.peerjs.com). Check your internet connection and try again.",
				);
				return;
			}

			// Fetch relay credentials before building the offer so the connection
			// can fall back to TURN when no direct route exists.
			await ensureTurnServer();
			if (attempt.canceled) return;
			applyIceServers(peer);

			if (senderId === peer.id) {
				failAttempt(
					attempt,
					"That link points back at this device. Open the QR code on the other device.",
				);
				return;
			}

			let connection: DataConnection;
			try {
				connection = peer.connect(senderId, { reliable: true });
			} catch (error) {
				console.error("Failed to start connection:", error);
				failAttempt(attempt, connectionErrorMessage(error));
				return;
			}

			attempt.connection = connection;
			setSenderConnection(connection);

			connection.on("open", () => {
				if (attempt.canceled) return;
				if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
				attempt.connectTimer = null;
				setConnectionStatus("verifying");
				setConnectionError(null);
				setIsSender(false);

				// Generate a unique name for this receiver
				const receiverName = uniqueNamesGenerator({
					dictionaries: [adjectives, animals],
					separator: "-",
					style: "capital",
				});

				// Send hello message with our name
				connection.send({ type: "HELLO", name: receiverName });

				// The security handshake must finish too, or we would spin forever.
				attempt.handshakeTimer = setTimeout(() => {
					failAttempt(
						attempt,
						"Connected to the sender, but the security check never completed. Please try again.",
					);
				}, HANDSHAKE_TIMEOUT_MS);
			});

			connection.on("data", (data) => {
				handlePeerMessageRef.current?.(data as PeerMessage, connection);
			});

			connection.on("error", (error) => {
				console.error("Connection error:", error);
				failAttempt(attempt, connectionErrorMessage(error));
			});

			let lostTimer: ReturnType<typeof setTimeout> | null = null;

			/** The peer is gone (their page closed, or the network dropped). */
			const reportLost = () => {
				if (lostTimer) {
					clearTimeout(lostTimer);
					lostTimer = null;
				}
				attempt.canceled = true;
				if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
				if (attempt.handshakeTimer) clearTimeout(attempt.handshakeTimer);
				if (attemptRef.current === attempt) attemptRef.current = null;
				setSenderConnection(null);
				setIsConnected(false);
				setConnectionStatus("disconnected");
				setConnectionError(
					"Lost the connection to the sender. Check that their DropShare page is still open, then try again.",
				);
			};

			connection.on("iceStateChanged", (state) => {
				if (state === "connected" || state === "completed") {
					// Recovered: a transient drop is not worth reporting.
					if (lostTimer) {
						clearTimeout(lostTimer);
						lostTimer = null;
					}
					return;
				}

				if (state === "disconnected") {
					// Chrome often stays here (instead of moving on to "failed")
					// when the other side vanishes, so don't wait for "failed".
					if (!connection.open || lostTimer) return;
					lostTimer = setTimeout(reportLost, ICE_LOST_GRACE_MS);
					return;
				}

				if (state === "failed" || state === "closed") {
					if (connection.open) {
						reportLost();
						return;
					}
					failAttempt(
						attempt,
						`Could not reach the sender. ${connectionHint()}`,
					);
				}
			});

			const handleClosed = () => {
				if (attempt.canceled) return;
				attempt.canceled = true;
				if (attempt.connectTimer) clearTimeout(attempt.connectTimer);
				if (attempt.handshakeTimer) clearTimeout(attempt.handshakeTimer);
				if (attemptRef.current === attempt) attemptRef.current = null;
				setSenderConnection(null);
				setIsConnected(false);
				setReceivedFiles([]);
				setConnectionStatus((current) =>
					current === "connected" ? "disconnected" : "error",
				);
				setConnectionError(
					(current) => current ?? "The connection to the sender closed.",
				);
			};

			connection.on("close", handleClosed);

			// A connection that never opens is the common failure case: report it
			// instead of leaving the user on a spinner forever.
			if (!connection.open) {
				attempt.connectTimer = setTimeout(() => {
					failAttempt(
						attempt,
						`Could not reach the sender in time. ${connectionHint()}`,
					);
				}, CONNECT_TIMEOUT_MS);
			}
		},
		[
			cancelAttempt,
			ensurePeerReady,
			failAttempt,
			setIsSender,
			setSenderConnection,
		],
	);

	/** Re-runs the last connection attempt (used by the Retry button). */
	const retryConnection = useCallback(() => {
		const senderId = lastSenderIdRef.current;
		cancelAttempt();
		if (senderId) {
			connectToSender(senderId);
		}
	}, [cancelAttempt, connectToSender]);

	const requestFile = useCallback((fileId: string) => {
		const { senderConnection } = usePeerStore.getState();
		if (senderConnection) {
			senderConnection.send({ type: "REQUEST_FILE", fileId });
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
		connectionError,
		isSignalingConnected,
		signalingError,
		addFiles,
		connectToSender,
		retryConnection,
		requestFile,
		removeFile,
		removePeer,
	};
}
