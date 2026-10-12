import jsQR from "jsqr";
import { AlertCircle, Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

interface QrScannerProps {
	onScan: (data: string) => void;
	onClose: () => void;
}

// Only the centre square of the camera frame is decoded: it is what the guide
// box points at, and it keeps every decode pass small on high-resolution
// streams (phones and tablets hand out 1080p+ by default).
const SCAN_REGION_FRACTION = 0.8;
const MAX_SCAN_DIM = 720;
const SCAN_INTERVAL_MS = 100; // ~10 decodes/second keeps the preview smooth

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
	// Ask for a moderate resolution: full-sensor frames make jsQR slow enough
	// to miss the code entirely on a tablet.
	{
		video: {
			facingMode: { ideal: "environment" },
			width: { ideal: 1280 },
			height: { ideal: 720 },
		},
	},
	{ video: { facingMode: { ideal: "environment" } } }, // back camera preferred
	{ video: { facingMode: { ideal: "user" } } }, // front camera fallback
	{ video: true }, // any camera
];

function cameraErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		switch (err.name) {
			case "NotAllowedError":
			case "SecurityError":
				return "Camera access denied. Please allow camera permissions and try again.";
			case "NotFoundError":
			case "OverconstrainedError":
				return "No usable camera found on this device.";
			case "NotReadableError":
			case "TrackStartError":
				return "The camera is already in use by another app. Close it and try again.";
			case "NotSupportedError":
				return "Camera not supported on this device.";
			default:
				return err.message;
		}
	}
	return "Failed to access camera. Please check your permissions.";
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const onScanRef = useRef(onScan);
	const didScanRef = useRef(false);
	const [error, setError] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);

	// The scan loop calls the newest callback through a ref, so a re-render of
	// the parent never tears down and restarts the camera.
	useEffect(() => {
		onScanRef.current = onScan;
	}, [onScan]);

	useEffect(() => {
		let stream: MediaStream | null = null;
		let animationFrameId = 0;
		let lastScanAt = 0;
		let cancelled = false;

		const stopStream = () => {
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				stream = null;
			}
		};

		const scanFrame = () => {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (!video || !canvas) return;

			const videoWidth = video.videoWidth;
			const videoHeight = video.videoHeight;
			if (!videoWidth || !videoHeight) return;

			// Crop the centre square, only shrinking it when the stream is huge:
			// the code keeps its native resolution but jsQR analyses ~6x fewer
			// pixels than it would for a full 1080p frame.
			const region = Math.min(videoWidth, videoHeight) * SCAN_REGION_FRACTION;
			const size = Math.round(Math.min(region, MAX_SCAN_DIM));
			canvas.width = size;
			canvas.height = size;

			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) return;

			ctx.drawImage(
				video,
				(videoWidth - region) / 2,
				(videoHeight - region) / 2,
				region,
				region,
				0,
				0,
				size,
				size,
			);

			const imageData = ctx.getImageData(0, 0, size, size);
			// "attemptBoth" also decodes QRs drawn light-on-dark, such as the
			// one the dark theme renders or another app's inverted code.
			const code = jsQR(imageData.data, size, size, {
				inversionAttempts: "attemptBoth",
			});

			if (code?.data) {
				didScanRef.current = true;
				onScanRef.current(code.data);
			}
		};

		const tick = (timestamp: number) => {
			if (cancelled || didScanRef.current) return;
			animationFrameId = requestAnimationFrame(tick);

			const video = videoRef.current;
			if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;
			if (timestamp - lastScanAt < SCAN_INTERVAL_MS) return;

			lastScanAt = timestamp;
			try {
				scanFrame();
			} catch (err) {
				// One bad frame must never kill the scan loop.
				console.error("QR scan failed for this frame:", err);
			}
		};

		const startCamera = async () => {
			try {
				setIsLoading(true);
				setError("");

				if (!navigator.mediaDevices?.getUserMedia) {
					throw new Error("Camera access is not available in this browser.");
				}

				// Check if we're on HTTPS (required for camera access)
				if (
					location.protocol !== "https:" &&
					location.hostname !== "localhost"
				) {
					throw new Error(
						"HTTPS is required for camera access. Please use a secure connection.",
					);
				}

				for (const constraint of CAMERA_CONSTRAINTS) {
					try {
						stream = await navigator.mediaDevices.getUserMedia(constraint);
						break;
					} catch (err) {
						console.warn("Failed camera constraint:", constraint, err);
					}
				}

				if (!stream) {
					throw new Error(
						"No camera could be accessed. Please check your camera permissions.",
					);
				}

				// Unmounted (or restarted) while the permission prompt was open:
				// release the camera instead of leaking a live stream.
				if (cancelled) {
					stopStream();
					return;
				}

				const video = videoRef.current;
				if (!video) {
					stopStream();
					return;
				}

				video.srcObject = stream;
				await video.play();

				if (cancelled) return;
				setIsLoading(false);
				animationFrameId = requestAnimationFrame(tick);
			} catch (err) {
				console.error("Camera access error:", err);
				if (cancelled) return;
				setIsLoading(false);
				setError(cameraErrorMessage(err));
			}
		};

		startCamera();

		return () => {
			cancelled = true;
			cancelAnimationFrame(animationFrameId);
			stopStream();
			const video = videoRef.current;
			if (video) {
				video.srcObject = null;
			}
		};
	}, []);

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="relative w-full max-w-md">
				{error ? (
					<div className="bg-background rounded-lg p-6 space-y-4">
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
						<div className="flex gap-2">
							<Button onClick={onClose} className="flex-1">
								Close
							</Button>
							<Button
								onClick={() => window.location.reload()}
								variant="outline"
								className="flex-1"
							>
								Retry
							</Button>
						</div>
					</div>
				) : (
					<>
						<video
							ref={videoRef}
							className="w-full h-auto rounded-lg bg-black"
							autoPlay
							playsInline
							muted
							aria-label="Camera feed for QR scanning"
						/>
						<canvas ref={canvasRef} className="hidden" />

						{isLoading && (
							<div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
								<div className="text-white text-center">
									<Camera className="h-8 w-8 mx-auto mb-2 animate-pulse" />
									<p>Starting camera...</p>
								</div>
							</div>
						)}

						{!isLoading && (
							<div className="absolute inset-0 pointer-events-none">
								{/* Guide box marks the region that is actually decoded */}
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="relative h-[80%] max-w-full aspect-square rounded-lg border-2 border-white/40">
										<div className="absolute -top-px -left-px w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
										<div className="absolute -top-px -right-px w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
										<div className="absolute -bottom-px -left-px w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
										<div className="absolute -bottom-px -right-px w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
									</div>
								</div>
								<div className="absolute bottom-4 left-4 right-4 text-center">
									<p className="text-white text-sm bg-black/50 rounded px-2 py-1">
										Point camera at QR code
									</p>
								</div>
							</div>
						)}
					</>
				)}

				<Button
					onClick={onClose}
					variant="destructive"
					size="icon"
					className="absolute top-2 right-2 z-20 pointer-events-auto"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
