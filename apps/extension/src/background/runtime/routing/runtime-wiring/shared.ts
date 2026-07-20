import type { BackgroundRuntimeState } from '../../../application/runtime-state';

export type BackgroundModeState = BackgroundRuntimeState;

export type RuntimeWiringLogger = {
  log: (...value: unknown[]) => void;
  warn: (...value: unknown[]) => void;
};

export const STARTUP_RECORDINGS_RETENTION_DAYS = 7;
