/**
 * Health check for the public TURN relay DropShare depends on.
 *
 * The app cannot connect on restricted networks without this relay, so a dead
 * relay should show up here instead of in the middle of a transfer. The check
 * fetches a fresh credential and then proves it can actually allocate a relay:
 * it builds an RTCPeerConnection that may only use relay candidates and
 * expects one to be gathered. (A credential endpoint that answers while the
 * TURN server rejects allocations is a real failure mode — it is how the
 * previous public relay, OpenRelay's static credentials, died.)
 *
 * Run locally with `bun run check:turn`; the scheduled GitHub workflow runs it
 * daily.
 */

import fs from "node:fs";
import puppeteer from "puppeteer-core";

const TURN_CREDENTIAL_URL =
	"https://turn.elixir-webrtc.org/?service=turn&username=dropshare-healthcheck";
const GATHER_TIMEOUT_MS = 15000;

const chromePaths = [
	process.env.PUPPETEER_EXECUTABLE_PATH,
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
].filter((path) => path && fs.existsSync(path));

if (chromePaths.length === 0) {
	console.error("No Chrome/Chromium binary found. Set CHROME_PATH and retry.");
	process.exit(2);
}

let credentials;
try {
	const response = await fetch(TURN_CREDENTIAL_URL, { method: "POST" });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	credentials = await response.json();
} catch (error) {
	console.error(`FAIL: could not fetch TURN credentials: ${error.message}`);
	process.exit(1);
}

if (
	!credentials.uris?.length ||
	!credentials.username ||
	!credentials.password
) {
	console.error(
		"FAIL: credential response is missing uris/username/password:",
		credentials,
	);
	process.exit(1);
}

const browser = await puppeteer.launch({
	executablePath: chromePaths[0],
	headless: true,
	args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
	const page = await browser.newPage();
	const result = await page.evaluate(
		async ({ turn, timeoutMs }) => {
			const pc = new RTCPeerConnection({
				iceServers: [
					{
						urls: turn.uris,
						username: turn.username,
						credential: turn.password,
					},
				],
				// Only relay candidates count: if TURN allocation fails, this
				// connection gathers nothing at all.
				iceTransportPolicy: "relay",
			});

			let relayCandidates = 0;
			const errors = [];
			pc.onicecandidate = (event) => {
				if (event.candidate?.type === "relay") relayCandidates += 1;
			};
			pc.onicecandidateerror = (event) =>
				errors.push(
					`${event.url} code=${event.errorCode} ${event.errorText ?? ""}`.trim(),
				);

			pc.createDataChannel("probe");
			await pc.setLocalDescription(await pc.createOffer());
			await new Promise((resolve) => {
				pc.addEventListener("icegatheringstatechange", () => {
					if (pc.iceGatheringState === "complete") resolve();
				});
				setTimeout(resolve, timeoutMs);
			});
			pc.close();
			return { relayCandidates, errors };
		},
		{ turn: credentials, timeoutMs: GATHER_TIMEOUT_MS },
	);

	if (result.relayCandidates === 0) {
		console.error("FAIL: no relay candidate could be gathered.");
		for (const error of result.errors) console.error(`  ICE error: ${error}`);
		process.exitCode = 1;
	} else {
		console.log(
			`OK: ${result.relayCandidates} relay candidate(s) gathered via ${credentials.uris.join(", ")} (ttl ${credentials.ttl}s)`,
		);
	}
} catch (error) {
	console.error("FAIL: TURN probe crashed:", error);
	process.exitCode = 1;
} finally {
	await browser.close();
}
