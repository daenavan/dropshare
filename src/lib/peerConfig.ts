/**
 * PeerJS / WebRTC configuration and user-facing error messages.
 *
 * STUN alone cannot connect every pair of devices: Wi-Fi client isolation,
 * guest networks, routers without NAT hairpin support and symmetric NAT all
 * block the direct path. DropShare therefore also uses a TURN relay, which
 * carries the traffic when no direct route can be built.
 *
 * The relay is the public, signup-free one run by the elixir-webrtc project.
 * Its short-lived credentials are fetched over HTTPS on demand, so there is
 * nothing to configure at build time; if the service is unreachable the app
 * falls back to STUN and direct connections.
 *
 * What the relay can see: nothing useful. WebRTC DataChannels are always
 * DTLS-encrypted between the two peers, and DropShare additionally encrypts
 * every file chunk with AES-GCM before handing it to WebRTC, so the relay
 * only ever forwards opaque ciphertext.
 */

import type { Peer } from "peerjs";

const STUN_SERVERS = [
	"stun:stun.l.google.com:19302",
	"stun:stun1.l.google.com:19302",
	"stun:stun2.l.google.com:19302",
	"stun:stun3.l.google.com:19302",
	"stun:stun4.l.google.com:19302",
];

// Public credential service for the elixir-webrtc TURN server:
// https://github.com/elixir-webrtc/turn-server — POST returns short-lived
// credentials (username/password + TTL) for its coturn instance.
const TURN_CREDENTIAL_URL =
	"https://turn.elixir-webrtc.org/?service=turn&username=dropshare";
// Never block a connection attempt for long on this service.
const TURN_FETCH_TIMEOUT_MS = 4000;
// Refresh the credentials shortly before they expire server-side.
const TURN_REFRESH_MARGIN_MS = 120 * 1000;

interface TurnCredentialResponse {
	uris?: string[];
	username?: string;
	password?: string;
	ttl?: number;
}

let turnServer: RTCIceServer | null = null;
let turnServerExpiresAt = 0;
let turnRequest: Promise<RTCIceServer | null> | null = null;

/**
 * Fetches (and caches) credentials for the public TURN relay. Never throws:
 * when the service is unavailable the caller keeps working with STUN only.
 */
export async function ensureTurnServer(): Promise<RTCIceServer | null> {
	if (turnServer && Date.now() < turnServerExpiresAt) return turnServer;
	if (turnRequest) return turnRequest;

	turnRequest = (async () => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(TURN_CREDENTIAL_URL, {
				method: "POST",
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const body = (await response.json()) as TurnCredentialResponse;
			if (!body.uris?.length || !body.username || !body.password) {
				throw new Error("incomplete TURN credentials");
			}

			turnServer = {
				urls: body.uris,
				username: body.username,
				credential: body.password,
			};
			const ttlMs = (body.ttl ?? 1800) * 1000;
			turnServerExpiresAt =
				Date.now() + Math.max(60 * 1000, ttlMs - TURN_REFRESH_MARGIN_MS);
			return turnServer;
		} catch (error) {
			console.warn(
				"Public TURN relay unavailable, continuing with direct connections:",
				error,
			);
			return turnServer;
		} finally {
			clearTimeout(timer);
			turnRequest = null;
		}
	})();

	return turnRequest;
}

export function hasTurnServer(): boolean {
	return turnServer !== null;
}

export function buildIceServers(): RTCIceServer[] {
	const servers: RTCIceServer[] = [{ urls: STUN_SERVERS }];
	if (turnServer) servers.push(turnServer);
	return servers;
}

/**
 * Points a live PeerJS peer at the current ICE server list. PeerJS reads this
 * config when it creates each RTCPeerConnection, so the change applies to
 * connections opened after the call.
 */
export function applyIceServers(peer: Peer): void {
	const config = peer.options.config;
	if (config) config.iceServers = buildIceServers();
}

/** Extra guidance shown with connection failures, depending on how we are set up. */
export function connectionHint(): string {
	return hasTurnServer()
		? "The relay server could not be reached. Check that both devices have internet access, then try again."
		: "Make sure both devices are on the same Wi-Fi and that it allows device-to-device traffic (guest networks and some routers block it). Turning off VPNs / private DNS on both devices also helps.";
}

/**
 * Turns a PeerJS error into something a user can act on. Peer errors carry a
 * `type`; anything else falls back to its message.
 */
export function connectionErrorMessage(error: unknown): string {
	const type =
		typeof error === "object" && error !== null && "type" in error
			? String((error as { type: unknown }).type)
			: "";

	switch (type) {
		case "peer-unavailable":
			return "Could not reach the sender. Their page may be closed, or the QR code is out of date — ask them to keep DropShare open and show a fresh QR code.";
		case "negotiation-failed":
			return `The two devices found each other but could not connect. ${connectionHint()}`;
		case "connection-closed":
			return "The connection to the sender closed before it was established.";
		case "network":
		case "socket-error":
		case "socket-closed":
		case "server-error":
			return "Lost connection to the connection service (0.peerjs.com). Check your internet connection and try again.";
		case "browser-incompatible":
			return "This browser does not support the WebRTC features DropShare needs.";
		case "webrtc":
			return "WebRTC failed to start on this device. Try reloading the page.";
		case "ssl-unavailable":
			return "A secure connection to the connection service could not be made.";
		case "invalid-id":
		case "invalid-key":
			return "The connection details in this link are not valid. Scan the sender's QR code again.";
		default:
			if (error instanceof Error && error.message) return error.message;
			return "Could not connect to the sender. Please try again.";
	}
}
