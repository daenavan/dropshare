import {
	AlertCircle,
	Check,
	Copy,
	FileText,
	Info,
	QrCode,
	Share2,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import QRCode from "react-qr-code";
import { FileItem } from "@/components/FileItem";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConnectedPeer, SharedFile } from "@/hooks/usePeer";
import { useWindowSize } from "@/hooks/useWindowSize";

interface SenderViewProps {
	peerId: string | null;
	sharedFiles: SharedFile[];
	connectedPeers: ConnectedPeer[];
	onFilesSelected: (files: File[]) => void;
	onRemoveFile: (fileId: string) => void;
	onRemovePeer: (peerId: string) => void;
}

export function SenderView({
	peerId,
	sharedFiles,
	connectedPeers,
	onFilesSelected,
	onRemoveFile,
	onRemovePeer,
}: SenderViewProps) {
	const [copySuccess, setCopySuccess] = useState(false);
	const [shareError, setShareError] = useState<string | null>(null);
	const { isMobile } = useWindowSize();
	const isShareSupported = isMobile && "share" in navigator;

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: onFilesSelected,
	});

	const qrValue = peerId ? `${window.location.origin}/dropshare#${peerId}` : "";

	const handleCopyUrl = async () => {
		try {
			await navigator.clipboard.writeText(qrValue);
			setCopySuccess(true);
			setTimeout(() => setCopySuccess(false), 2000);
		} catch (err) {
			console.error("Failed to copy URL:", err);
		}
	};

	const handleShare = async () => {
		setShareError(null);
		if (isShareSupported) {
			try {
				await navigator.share({
					title: "DropShare Connection",
					text: "Connect to my DropShare to receive files.",
					url: qrValue,
				});
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					console.error("Failed to share:", err);
					setShareError("Something went wrong. Could not open share dialog.");
				}
			}
		} else {
			setShareError(
				"Share feature is not supported on your browser or device.",
			);
		}
	};

	return (
		<div className="w-full max-w-4xl mx-auto space-y-6">
			{/* QR Code Section */}
			<Card className="text-center">
				<CardHeader>
					<CardTitle className="flex items-center justify-center gap-2">
						<QrCode className="h-5 w-5" />
						Share Connection
					</CardTitle>
					<CardDescription>
						Others can scan this QR code to connect and receive your files
					</CardDescription>
				</CardHeader>
				<CardContent>
					{peerId ? (
						<div className="flex flex-col items-center space-y-4">
							<div className="p-4 bg-background border rounded-lg">
								<QRCode
									value={qrValue}
									size={200}
									bgColor="transparent"
									fgColor="currentColor"
									className="text-foreground"
								/>
							</div>
							<div className="w-full max-w-xs space-y-2">
								<div className="flex flex-col sm:flex-row gap-2">
									<Button
										onClick={handleCopyUrl}
										variant="outline"
										className="flex-1"
										disabled={copySuccess}
									>
										{copySuccess ? (
											<>
												<Check className="mr-2 h-4 w-4" />
												Copied!
											</>
										) : (
											<>
												<Copy className="mr-2 h-4 w-4" />
												Copy URL
											</>
										)}
									</Button>
									{isMobile && (
										<div className="flex-1 flex items-center gap-2">
											<Button
												onClick={handleShare}
												className="flex-1"
												disabled={!isShareSupported}
											>
												<Share2 className="mr-2 h-4 w-4" />
												Share Link
											</Button>
											{!isShareSupported && (
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger>
															<Info className="h-5 w-5 text-muted-foreground" />
														</TooltipTrigger>
														<TooltipContent>
															<p>
																Share feature is not supported on this device.
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											)}
										</div>
									)}
								</div>
								{shareError && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{shareError}</AlertDescription>
									</Alert>
								)}
							</div>
						</div>
					) : (
						<div className="flex items-center justify-center h-52 text-muted-foreground">
							<div className="text-center">
								<QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
								<p>Generating connection...</p>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* File Upload and List */}
				<Card>
					<CardHeader>
						<CardTitle>Share Files</CardTitle>
						<CardDescription>
							Drop files here or click to select files to share
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Dropzone */}
						<div
							{...getRootProps()}
							className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
								isDragActive
									? "border-primary bg-primary/10"
									: "border-border hover:border-primary/50"
							}`}
						>
							<input {...getInputProps()} />
							<FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
							<p className="text-sm text-muted-foreground">
								{isDragActive
									? "Drop the files now!"
									: "Drag files here or click to select"}
							</p>
						</div>

						{/* Shared Files List */}
						{sharedFiles.length > 0 && (
							<div>
								<h4 className="font-medium mb-2">Shared Files</h4>
								<ScrollArea className="h-40 w-full">
									<div className="space-y-2">
										{sharedFiles.map((sharedFile) => (
											<FileItem
												key={sharedFile.id}
												id={sharedFile.id}
												name={sharedFile.file.name}
												size={sharedFile.file.size}
												variant="sender"
												onRemoveFile={onRemoveFile}
											/>
										))}
									</div>
								</ScrollArea>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Connected Receivers */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Users className="h-5 w-5" />
							Connected Receivers ({connectedPeers.length})
						</CardTitle>
						<CardDescription>
							Devices currently connected to receive your files
						</CardDescription>
					</CardHeader>
					<CardContent>
						{connectedPeers.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								<Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
								<p>No receivers connected yet</p>
								<p className="text-sm">
									Share the QR code above for others to connect
								</p>
							</div>
						) : (
							<ScrollArea className="h-40 w-full">
								<div className="space-y-2">
									{connectedPeers.map((peer) => (
										<div
											key={peer.id}
											className="flex items-center justify-between p-3 border rounded-lg"
										>
											<div className="flex items-center">
												<div
													className={`w-3 h-3 rounded-full mr-3 ${
														peer.isVerified
															? "bg-green-500"
															: "bg-yellow-500 animate-pulse"
													}`}
												/>
												<div>
													<p className="font-medium">{peer.name}</p>
													<p className="text-xs text-muted-foreground">
														{peer.id.slice(0, 8)}...
														{peer.isVerified
															? " (Verified)"
															: " (Verifying...)"}
													</p>
												</div>
											</div>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => onRemovePeer(peer.id)}
												className="h-8 w-8"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							</ScrollArea>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
