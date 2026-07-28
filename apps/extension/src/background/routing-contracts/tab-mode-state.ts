import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';

export type ScreenshotViewport = AppliedViewportPresetPayload | null;

export type ViewportState = Map<number, ScreenshotViewport>;

type ScreenshotViewportOwner = 'capture-surface' | 'viewer';

export type ViewportOwnerState = Map<number, ScreenshotViewportOwner>;

export type ModeState = Map<number, boolean>;
