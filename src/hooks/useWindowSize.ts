import { useEffect, useState } from "react";

interface WindowSize {
	width: number | undefined;
	height: number | undefined;
	isMobile: boolean;
}

export function useWindowSize(): WindowSize {
	const [windowSize, setWindowSize] = useState<WindowSize>({
		width: undefined,
		height: undefined,
		isMobile: false,
	});

	useEffect(() => {
		function handleResize() {
			const isMobile = window.innerWidth < 768;
			setWindowSize({
				width: window.innerWidth,
				height: window.innerHeight,
				isMobile,
			});
		}

		window.addEventListener("resize", handleResize);
		handleResize();

		return () => window.removeEventListener("resize", handleResize);
	}, []);

	return windowSize;
}
