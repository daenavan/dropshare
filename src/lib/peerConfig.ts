/**
 * PeerJS / WebRTC configuration and user-facing error messages.
 *
 * STUN alone is not enough on many networks: if the Wi-Fi blocks
 * device-to-device traffic (client isolation), if the devices are on different
 * networks, or if a carrier uses symmetric NAT, the peers can find each other
 * but never reach each other. A TURN relay fixes all of those cases, so it is
 * configurable at build time (see README).
 */

const STUN_SERVERS = [
	"stun:stun.l.google.com:19302",
	"stun:stun1.l.google.com:19302",
	"stun:stun2.l.google.com:19302",
	"stun:stun3.l.google.com:19302",
	"stun:stun4.l.google.com:19302",
];

function turnUrls(): string[] {
	return (
		import.meta.env.VITE_TURN_URL?.split(",")
			.map((url) => url.trim())
			.filter(Boolean) ?? []
	);
}

export function hasTurnServer(): boolean {
	return turnUrls().length > 0;
}

export function buildIceServers(): RTCIceServer[] {
	const servers: RTCIceServer[] = [{ urls: STUN_SERVERS }];
	const urls = turnUrls();

	if (urls.length > 0) {
		servers.push({
			urls,
			username: import.meta.env.VITE_TURN_USERNAME || undefined,
			credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
		});
	}

	return servers;
}

/** Extra guidance shown with connection failures, depending on how we are set up. */
export function connectionHint(): string {
	return hasTurnServer()
		? "Both devices need internet access to reach the relay server. Keep both pages open and try again."
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
			return `The two devices found each other but could not connect directly. ${connectionHint()}`;
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
