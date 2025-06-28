import Peer, { type DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";

// Represents a connected peer (receiver)
export interface ConnectedPeer {
	id: string;
	name: string;
	connection: DataConnection;
}

// Represents a file staged for sharing
export interface SharedFile {
	file: File;
	id: string;
}

// Message types for peer communication
export type PeerMessage =
	| { type: "HELLO"; name: string }
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
	  }
	| {
			type: "FILE_CHUNK";
			fileId: string;
			chunkIndex: number;
			data: ArrayBuffer;
			isLast: boolean;
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

	const peerRef = useRef<Peer | null>(null);
	const senderConnectionRef = useRef<DataConnection | null>(null);
	const downloadBuffersRef = useRef<
		Record<
			string,
			{ chunks: ArrayBuffer[]; metadata: { name: string; size: number } }
		>
	>({});

	const sendFileToReceiver = useCallback(
		async (sharedFile: SharedFile, conn: DataConnection) => {
			const { file, id } = sharedFile;
			const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

			// Send metadata first
			conn.send({
				type: "FILE_METADATA",
				fileId: id,
				name: file.name,
				size: file.size.toString(),
				totalChunks,
			});

			// Send file in chunks
			for (let i = 0; i < totalChunks; i++) {
				const start = i * CHUNK_SIZE;
				const end = Math.min(start + CHUNK_SIZE, file.size);
				const chunk = file.slice(start, end);
				const arrayBuffer = await chunk.arrayBuffer();

				conn.send({
					type: "FILE_CHUNK",
					fileId: id,
					chunkIndex: i,
					data: arrayBuffer,
					isLast: i === totalChunks - 1,
				});

				// Small delay to prevent overwhelming the connection
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		},
		[],
	);

	const handlePeerMessage = useCallback(
		(message: PeerMessage, conn: DataConnection) => {
			switch (message.type) {
				case "HELLO": {
					// A receiver connected and sent their name
					const newPeer: ConnectedPeer = {
						id: conn.peer,
						name: message.name,
						connection: conn,
					};
					setConnectedPeers((prev) => [
						...prev.filter((p) => p.id !== conn.peer),
						newPeer,
					]);

					// Send current files to the new receiver
					setSharedFiles((currentFiles) => {
						const fileManifest = currentFiles.map((sf) => ({
							id: sf.id,
							name: sf.file.name,
							size: sf.file.size,
						}));
						conn.send({ type: "FILES_UPDATE", files: fileManifest });
						return currentFiles;
					});
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
						fileBuffer.chunks[message.chunkIndex] = message.data;

						const received = fileBuffer.chunks.filter(
							(chunk) => chunk !== undefined,
						).length;
						const progress = (received / fileBuffer.chunks.length) * 100;
						setDownloadProgress((prev) => ({
							...prev,
							[message.fileId]: progress,
						}));

						if (message.isLast && received === fileBuffer.chunks.length) {
							// File complete, trigger download
							const completeFile = new Blob(fileBuffer.chunks);
							const url = URL.createObjectURL(completeFile);
							const a = document.createElement("a");
							a.href = url;
							a.download = fileBuffer.metadata.name;
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
		[sendFileToReceiver],
	);

	// Initialize PeerJS
	useEffect(() => {
		const peer = new Peer();
		peerRef.current = peer;

		peer.on("open", (id) => {
			setPeerId(id);
		});

		peer.on("connection", (conn) => {
			conn.on("open", () => {
				// Wait for hello message to get the peer's name
			});

			conn.on("data", (data) => {
				handlePeerMessage(data as PeerMessage, conn);
			});

			conn.on("close", () => {
				setConnectedPeers((prev) => prev.filter((p) => p.id !== conn.peer));
			});
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
				setIsConnected(true);
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

			conn.on("close", () => {
				setIsConnected(false);
				setReceivedFiles([]);
			});
		},
		[handlePeerMessage],
	);

	const requestFile = useCallback((fileId: string) => {
		if (senderConnectionRef.current) {
			senderConnectionRef.current.send({ type: "REQUEST_FILE", fileId });
		}
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
		addFiles,
		connectToSender,
		requestFile,
		removeFile,
	};
}
