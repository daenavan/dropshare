import { FileText, Loader2, Wifi, WifiOff } from "lucide-react";
import { FileItem } from "@/components/FileItem";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ReceiverFile {
	id: string;
	name: string;
	size: number;
}

interface ReceiverViewProps {
	receivedFiles: ReceiverFile[];
	downloadProgress: Record<string, number>;
	onRequestFile: (fileId: string) => void;
	isConnected: boolean;
	connectionStatus:
		| "connecting"
		| "verifying"
		| "connected"
		| "error"
		| "disconnected";
}

export function ReceiverView({
	receivedFiles,
	downloadProgress,
	onRequestFile,
	isConnected,
	connectionStatus,
}: ReceiverViewProps) {
	const isDownloading = (fileId: string) => {
		return fileId in downloadProgress;
	};

	const getDownloadProgress = (fileId: string) => {
		return downloadProgress[fileId] || 0;
	};

	if (!isConnected) {
		const getStatusInfo = () => {
			switch (connectionStatus) {
				case "connecting":
					return {
						title: "Connecting...",
						description: "Establishing connection to the sender",
						icon: <Wifi className="h-5 w-5" />,
					};
				case "verifying":
					return {
						title: "Verifying Connection...",
						description: "Performing security verification with the sender",
						icon: <Loader2 className="h-5 w-5 animate-spin" />,
					};
				case "error":
					return {
						title: "Connection Failed",
						description:
							"Failed to establish secure connection. Please try again.",
						icon: <Wifi className="h-5 w-5 text-destructive" />,
					};
				case "disconnected":
					return {
						title: "Disconnected",
						description: "The sender has disconnected.",
						icon: <WifiOff className="h-5 w-5" />,
					};
				default:
					return {
						title: "Connecting...",
						description: "Establishing connection to the sender",
						icon: <Wifi className="h-5 w-5" />,
					};
			}
		};

		const statusInfo = getStatusInfo();

		return (
			<Card className="w-full max-w-lg mx-auto text-center">
				<CardHeader>
					<CardTitle className="flex items-center justify-center gap-2">
						{statusInfo.icon}
						{statusInfo.title}
					</CardTitle>
					<CardDescription>{statusInfo.description}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						{connectionStatus !== "error" &&
							connectionStatus !== "disconnected" && (
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
							)}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="w-full max-w-2xl mx-auto">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileText className="h-5 w-5" />
						Available Files ({receivedFiles.length})
					</CardTitle>
					<CardDescription>
						Files shared by the sender. Click download to save them to your
						device.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{receivedFiles.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							<FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
							<p className="text-lg font-medium mb-2">No files available</p>
							<p className="text-sm">
								The sender hasn't shared any files yet. Files will appear here
								when they're added.
							</p>
						</div>
					) : (
						<ScrollArea className="max-h-96 w-full">
							<div className="space-y-3">
								{receivedFiles.map((file) => {
									const downloading = isDownloading(file.id);
									const progress = getDownloadProgress(file.id);

									return (
										<FileItem
											key={file.id}
											id={file.id}
											name={file.name}
											size={file.size}
											variant="receiver"
											isDownloading={downloading}
											downloadProgress={progress}
											onRequestFile={onRequestFile}
										/>
									);
								})}
							</div>
						</ScrollArea>
					)}
				</CardContent>
			</Card>

			{/* Connection Status */}
			<div className="mt-4 text-center">
				<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
					<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
					Connected to sender
				</div>
			</div>
		</div>
	);
}
