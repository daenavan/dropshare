import { lazy, Suspense, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { usePeer } from "@/hooks/usePeer";

const LandingView = lazy(() =>
	import("@/components/LandingView").then((module) => ({
		default: module.LandingView,
	})),
);
const QrScanner = lazy(() =>
	import("@/components/QrScanner").then((module) => ({
		default: module.QrScanner,
	})),
);
const ReceiverView = lazy(() =>
	import("@/components/ReceiverView").then((module) => ({
		default: module.ReceiverView,
	})),
);
const SenderView = lazy(() =>
	import("@/components/SenderView").then((module) => ({
		default: module.SenderView,
	})),
);

export default function App() {
	const [showScanner, setShowScanner] = useState(false);
	const [hasInteracted, setHasInteracted] = useState(false);

	const {
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
	} = usePeer();

	// Check for sender ID in URL hash and connect if present
	useEffect(() => {
		const hash = window.location.hash.slice(1); // Remove the # character
		if (hash && hash !== peerId && !isSender) {
			// Only connect if the hash is different from our own peer ID and we're not already a sender
			connectToSender(hash);
		}
	}, [peerId, isSender, connectToSender]);

	// Clear hash when becoming a sender
	useEffect(() => {
		if (isSender && window.location.hash) {
			window.history.replaceState(null, "", window.location.pathname);
		}
	}, [isSender]);

	const handleStartSharing = () => {
		setHasInteracted(true);
	};

	const handleStartScanning = () => {
		setShowScanner(true);
	};

	const handleQrScan = (data: string) => {
		setShowScanner(false);

		try {
			const url = new URL(data);
			const hash = url.hash.slice(1);
			if (hash) {
				window.location.hash = hash;
				connectToSender(hash);
			}
		} catch {
			// If it's not a URL, treat it as a direct peer ID
			window.location.hash = data;
			connectToSender(data);
		}
	};

	const renderContent = () => {
		// If we have a hash in the URL and we're not the sender, show receiver view
		const hash = window.location.hash.slice(1);
		if (hash && hash !== peerId && !isSender) {
			return (
				<ReceiverView
					receivedFiles={receivedFiles}
					downloadProgress={downloadProgress}
					onRequestFile={requestFile}
					isConnected={isConnected}
					connectionStatus={connectionStatus}
				/>
			);
		}

		// If user hasn't interacted yet and there's no hash, show landing view
		if (!hasInteracted && !hash && !isSender && sharedFiles.length === 0) {
			return (
				<LandingView
					onStartSharing={handleStartSharing}
					onStartScanning={handleStartScanning}
				/>
			);
		}

		// Otherwise, show sender view (default)
		return (
			<SenderView
				peerId={peerId}
				sharedFiles={sharedFiles}
				connectedPeers={connectedPeers}
				onFilesSelected={(files) => {
					setHasInteracted(true);
					addFiles(files);
				}}
				onRemoveFile={removeFile}
				onRemovePeer={removePeer}
			/>
		);
	};

	return (
		<main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 w-full">
			<div className="absolute top-4 right-4">
				<ThemeToggle />
			</div>
			<div className="flex flex-col items-center justify-center w-full">
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold">DropShare</h1>
					<p className="text-muted-foreground">Secure P2P File Sharing</p>
				</div>

				<Suspense fallback={<div>Loading...</div>}>
					{renderContent()}

					{showScanner && (
						<QrScanner
							onScan={handleQrScan}
							onClose={() => setShowScanner(false)}
						/>
					)}
				</Suspense>
			</div>
		</main>
	);
}
