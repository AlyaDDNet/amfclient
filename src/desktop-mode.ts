export const DESKTOP_MIN_WIDTH = 1024;

export function isDesktopViewport(width: number): boolean {
	return Number.isFinite(width) && width >= DESKTOP_MIN_WIDTH;
}

export class DesktopModeController {
	private desktop: boolean | undefined;

	constructor(private readonly enterDesktop: () => void, private readonly enterCompact: () => void) {}

	update(width: number): boolean {
		const next = isDesktopViewport(width);
		if (next === this.desktop) return false;
		this.desktop = next;
		(next ? this.enterDesktop : this.enterCompact)();
		return true;
	}
}
