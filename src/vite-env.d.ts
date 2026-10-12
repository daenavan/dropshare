/// <reference types="vite/client" />

interface ImportMetaEnv {
	/**
	 * Comma-separated TURN server URLs, e.g.
	 * "turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349".
	 * Optional: without it DropShare relies on STUN + direct connectivity.
	 */
	readonly VITE_TURN_URL?: string;
	readonly VITE_TURN_USERNAME?: string;
	readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
