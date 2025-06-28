import { Download, FileText, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
}

export function ReceiverView({
	receivedFiles,
	downloadProgress,
	onRequestFile,
	isConnected,
}: ReceiverViewProps) {
	const formatFileSize = (bytes: number) => {
		return (bytes / 1024 / 1024).toFixed(2) + " MB";
	};

	const isDownloading = (fileId: string) => {
		return fileId in downloadProgress;
	};

	const getDownloadProgress = (fileId: string) => {
		return downloadProgress[fileId] || 0;
	};

	if (!isConnected) {
		return (
			<Card className="w-full max-w-lg mx-auto text-center">
				<CardHeader>
					<CardTitle className="flex items-center justify-center gap-2">
						<Wifi className="h-5 w-5" />
						Connecting...
					</CardTitle>
					<CardDescription>
						Establishing connection to the sender
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
										<div
											key={file.id}
											className="flex items-center justify-between p-4 border rounded-lg"
										>
											<div className="flex items-center flex-1 min-w-0 mr-4">
												<FileText className="h-5 w-5 mr-3 flex-shrink-0 text-muted-foreground" />
												<div className="flex-1 min-w-0">
													<p className="font-medium truncate">{file.name}</p>
													<p className="text-sm text-muted-foreground">
														{formatFileSize(file.size)}
													</p>
													{downloading && (
														<div className="mt-2">
															<Progress value={progress} className="h-2" />
															<p className="text-xs text-muted-foreground mt-1">
																Downloading... {progress.toFixed(0)}%
															</p>
														</div>
													)}
												</div>
											</div>
											<Button
												onClick={() => onRequestFile(file.id)}
												disabled={downloading}
												size="sm"
												className="flex-shrink-0"
											>
												{downloading ? (
													<>
														<Loader2 className="h-4 w-4 mr-2 animate-spin" />
														Downloading
													</>
												) : (
													<>
														<Download className="h-4 w-4 mr-2" />
														Download
													</>
												)}
											</Button>
										</div>
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
