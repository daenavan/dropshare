import { FileText } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

interface FileQueueProps {
	files: File[];
}

export function FileQueue({ files }: FileQueueProps) {
	return (
		<Card>
			<CardContent className="p-4">
				<h3 className="font-semibold mb-2">Files to be sent:</h3>
				<ScrollArea className="h-40 w-full">
					<ul className="space-y-2">
						{files.map((file, index) => (
							<li
								key={`${file.name}-${index}`}
								className="flex items-center text-sm"
							>
								<FileText className="h-4 w-4 mr-2 flex-shrink-0" />
								<span className="truncate flex-grow">{file.name}</span>
								<span className="text-muted-foreground ml-2 flex-shrink-0">
									{(file.size / 1024 / 1024).toFixed(2)} MB
								</span>
							</li>
						))}
					</ul>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
