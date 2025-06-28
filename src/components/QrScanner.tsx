import jsQR from "jsqr";
import { AlertCircle, Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";

interface QrScannerProps {
	onScan: (data: string) => void;
	onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationFrameId = useRef<number>(0);
	const [error, setError] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let stream: MediaStream;

		const tick = () => {
			if (
				videoRef.current &&
				videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
			) {
				const canvas = canvasRef.current!;
				const video = videoRef.current;
				const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

				canvas.height = video.videoHeight;
				canvas.width = video.videoWidth;
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const code = jsQR(imageData.data, imageData.width, imageData.height, {
					inversionAttempts: "dontInvert",
				});

				if (code) {
					onScan(code.data);
				} else {
					animationFrameId.current = requestAnimationFrame(tick);
				}
			} else {
				animationFrameId.current = requestAnimationFrame(tick);
			}
		};

		const startCamera = async () => {
			try {
				setIsLoading(true);
				setError("");

				// Check if we're on HTTPS (required for camera access)
				if (
					location.protocol !== "https:" &&
					location.hostname !== "localhost"
				) {
					throw new Error(
						"HTTPS is required for camera access. Please use a secure connection.",
					);
				}

				// Try different camera configurations
				const constraints = [
					{ video: { facingMode: "environment" } }, // Back camera preferred
					{ video: { facingMode: "user" } }, // Front camera fallback
					{ video: true }, // Any camera
				];

				let cameraStream: MediaStream | null = null;

				for (const constraint of constraints) {
					try {
						cameraStream =
							await navigator.mediaDevices.getUserMedia(constraint);
						break;
					} catch (err) {
						console.warn("Failed camera constraint:", constraint, err);
					}
				}

				if (!cameraStream) {
					throw new Error(
						"No camera could be accessed. Please check your camera permissions.",
					);
				}

				stream = cameraStream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
					setIsLoading(false);
					animationFrameId.current = requestAnimationFrame(tick);
				}
			} catch (err) {
				console.error("Camera access error:", err);
				setIsLoading(false);

				if (err instanceof Error) {
					if (err.name === "NotAllowedError") {
						setError(
							"Camera access denied. Please allow camera permissions and try again.",
						);
					} else if (err.name === "NotFoundError") {
						setError("No camera found on this device.");
					} else if (err.name === "NotSupportedError") {
						setError("Camera not supported on this device.");
					} else {
						setError(err.message);
					}
				} else {
					setError("Failed to access camera. Please check your permissions.");
				}
			}
		};

		startCamera();

		return () => {
			if (animationFrameId.current) {
				cancelAnimationFrame(animationFrameId.current);
			}
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}
		};
	}, [onScan]);

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
						{isLoading && (
							<div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
								<div className="text-white text-center">
									<Camera className="h-8 w-8 mx-auto mb-2 animate-pulse" />
									<p>Starting camera...</p>
								</div>
							</div>
						)}
						<video
							ref={videoRef}
							className="w-full h-auto rounded-lg"
							playsInline
							muted
							aria-label="Camera feed for QR scanning"
						>
							<track kind="captions" srcLang="en" label="English captions" />
						</video>
						<canvas ref={canvasRef} className="hidden" />

						{!isLoading && (
							<div className="absolute inset-0 pointer-events-none">
								{/* QR code scanning overlay */}
								<div className="absolute inset-4 border-2 border-white rounded-lg opacity-50">
									<div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
									<div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
									<div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
									<div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
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
					className="absolute top-2 right-2 pointer-events-auto"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
