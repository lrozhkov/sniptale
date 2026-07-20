export type ScreenshotViewport = { width: number; height: number } | null;

export type ViewportState = Map<number, ScreenshotViewport>;

type ScreenshotViewportOwner = 'debugger' | 'viewer';

export type ViewportOwnerState = Map<number, ScreenshotViewportOwner>;

export type ModeState = Map<number, boolean>;
