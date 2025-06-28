import {
	ChevronDown,
	ChevronUp,
	Download,
	FileText,
	Loader2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface BaseFileItemProps {
	id: string;
	name: string;
	size: number;
	variant: "receiver" | "sender";
}

interface ReceiverFileItemProps extends BaseFileItemProps {
	variant: "receiver";
	isDownloading?: boolean;
	downloadProgress?: number;
	onRequestFile: (fileId: string) => void;
}

interface SenderFileItemProps extends BaseFileItemProps {
	variant: "sender";
	onRemoveFile: (fileId: string) => void;
}

type FileItemProps = ReceiverFileItemProps | SenderFileItemProps;

export function FileItem(props: FileItemProps) {
	const { id, name, size, variant } = props;
	const [isExpanded, setIsExpanded] = useState(false);

	const formatFileSize = (bytes: number) => {
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	};

	const getFileExtension = (fileName: string) => {
		const lastDot = fileName.lastIndexOf(".");
		if (lastDot === -1 || lastDot === fileName.length - 1) {
			return "";
		}
		return fileName.substring(lastDot + 1).toUpperCase();
	};

	const truncateFileName = (fileName: string, maxLength = 30) => {
		if (fileName.length <= maxLength) {
			return fileName;
		}
		const extension = fileName.split(".").pop();
		const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf("."));
		const truncatedName = nameWithoutExt.substring(
			0,
			maxLength - (extension ? extension.length + 4 : 3),
		);
		return `${truncatedName}...${extension ? `.${extension}` : ""}`;
	};

	const isDownloading =
		variant === "receiver" ? props.isDownloading || false : false;
	const downloadProgress =
		variant === "receiver" ? props.downloadProgress || 0 : 0;

	const fileExtension = getFileExtension(name);
	const truncatedName = truncateFileName(name);
	const isNameTruncated = name.length > 30;

	return (
		<div className="flex items-start gap-3 p-3 border rounded-lg">
			{/* File Icon */}
			<FileText className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />

			{/* File Info - Takes remaining space but allows button to be visible */}
			<div className="flex-1 min-w-0 space-y-1">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-start gap-2">
							<p className="font-medium text-sm leading-tight break-words flex-1">
								{isExpanded ? name : truncatedName}
							</p>
							{isNameTruncated && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setIsExpanded(!isExpanded)}
									className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
								>
									{isExpanded ? (
										<ChevronUp className="h-3 w-3" />
									) : (
										<ChevronDown className="h-3 w-3" />
									)}
								</Button>
							)}
						</div>
						<p className="text-xs text-muted-foreground mt-0.5">
							{formatFileSize(size)}
							{fileExtension && ` • ${fileExtension}`}
						</p>
					</div>

					{/* Action Button - Fixed width, always visible */}
					<div className="flex-shrink-0">
						{variant === "receiver" ? (
							<Button
								onClick={() => props.onRequestFile(id)}
								disabled={isDownloading}
								size="sm"
								className="h-8 px-3"
							>
								{isDownloading ? (
									<>
										<Loader2 className="h-3 w-3 mr-1 animate-spin" />
										<span className="hidden sm:inline">Downloading</span>
										<span className="sm:hidden">...</span>
									</>
								) : (
									<>
										<Download className="h-3 w-3 mr-1" />
										<span className="hidden sm:inline">Download</span>
										<span className="sm:hidden">Get</span>
									</>
								)}
							</Button>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => props.onRemoveFile(id)}
								className="h-8 w-8 p-0 text-destructive hover:text-destructive"
							>
								<Trash2 className="h-3 w-3" />
							</Button>
						)}
					</div>
				</div>

				{/* Download Progress (only for receiver) */}
				{variant === "receiver" && isDownloading && (
					<div className="space-y-1">
						<Progress value={downloadProgress} className="h-1.5" />
						<p className="text-xs text-muted-foreground">
							Downloading... {downloadProgress.toFixed(0)}%
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
