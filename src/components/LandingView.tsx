import { Camera, FileUp, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface LandingViewProps {
	onStartSharing: () => void;
	onStartScanning: () => void;
}

export function LandingView({
	onStartSharing,
	onStartScanning,
}: LandingViewProps) {
	return (
		<div className="w-full max-w-4xl mx-auto">
			<div className="text-center mb-8">
				<p className="text-lg text-muted-foreground">
					Share files directly between devices using secure peer-to-peer
					technology
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* Share Files Option */}
				<Card className="text-center hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center justify-center gap-2">
							<FileUp className="h-6 w-6" />
							Share Files
						</CardTitle>
						<CardDescription>
							Start sharing files with anyone. They can scan your QR code or use
							your share link to connect.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="flex items-center justify-center">
								<QrCode className="h-16 w-16 text-primary" />
							</div>
							<p className="text-sm text-muted-foreground">
								Your device will generate a QR code and share link that others
								can use to connect and download your shared files.
							</p>
							<Button onClick={onStartSharing} className="w-full" size="lg">
								Start Sharing Files
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Receive Files Option */}
				<Card className="text-center hover:shadow-lg transition-shadow">
					<CardHeader>
						<CardTitle className="flex items-center justify-center gap-2">
							<Camera className="h-6 w-6" />
							Receive Files
						</CardTitle>
						<CardDescription>
							Scan a QR code or use a share link to connect and download shared
							files from another device.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="flex items-center justify-center">
								<Camera className="h-16 w-16 text-primary" />
							</div>
							<p className="text-sm text-muted-foreground">
								Use your camera to scan a QR code from someone who is sharing
								files with you.
							</p>
							<Button
								onClick={onStartScanning}
								variant="outline"
								className="w-full"
								size="lg"
							>
								Scan QR Code
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* How it works section */}
			<div className="mt-12 text-center">
				<h3 className="text-lg font-semibold mb-4">How it works</h3>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
					<div>
						<div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
							1
						</div>
						<p>One person starts sharing files and displays a QR code</p>
					</div>
					<div>
						<div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
							2
						</div>
						<p>Others scan the QR code or use the share link to connect</p>
					</div>
					<div>
						<div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">
							3
						</div>
						<p>Files are transferred directly and securely between devices</p>
					</div>
				</div>
			</div>
		</div>
	);
}
