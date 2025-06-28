import type { DataConnection } from "peerjs";
import { create } from "zustand";
import type { KeyPair } from "@/lib/crypto";

export interface PeerKeys {
	dhPublicKey: Uint8Array;
	signingPublicKey: Uint8Array;
	sharedKey?: Uint8Array;
}

interface PeerState {
	isSender: boolean;
	setIsSender: (isSender: boolean) => void;

	dhKeyPair: KeyPair | null;
	signingKeyPair: KeyPair | null;
	setCryptoKeys: (dhKeyPair: KeyPair, signingKeyPair: KeyPair) => void;

	peerKeys: Record<string, PeerKeys>;
	addPeerKeys: (peerId: string, keys: PeerKeys) => void;
	updatePeerSharedKey: (peerId: string, sharedKey: Uint8Array) => void;

	challenges: Record<string, ArrayBuffer>;
	addChallenge: (peerId: string, challenge: ArrayBuffer) => void;
	removeChallenge: (peerId: string) => void;

	senderConnection: DataConnection | null;
	setSenderConnection: (connection: DataConnection | null) => void;
}

export const usePeerStore = create<PeerState>((set, get) => ({
	isSender: false,
	setIsSender: (isSender) => set({ isSender }),

	dhKeyPair: null,
	signingKeyPair: null,
	setCryptoKeys: (dhKeyPair, signingKeyPair) =>
		set({ dhKeyPair, signingKeyPair }),

	peerKeys: {},
	addPeerKeys: (peerId, keys) =>
		set((state) => ({
			peerKeys: { ...state.peerKeys, [peerId]: keys },
		})),
	updatePeerSharedKey: (peerId, sharedKey) => {
		const peerKeys = get().peerKeys[peerId];
		if (peerKeys) {
			set((state) => ({
				peerKeys: {
					...state.peerKeys,
					[peerId]: { ...peerKeys, sharedKey },
				},
			}));
		}
	},

	challenges: {},
	addChallenge: (peerId, challenge) =>
		set((state) => ({
			challenges: { ...state.challenges, [peerId]: challenge },
		})),
	removeChallenge: (peerId) =>
		set((state) => {
			const newChallenges = { ...state.challenges };
			delete newChallenges[peerId];
			return { challenges: newChallenges };
		}),

	senderConnection: null,
	setSenderConnection: (connection) => set({ senderConnection: connection }),
}));
