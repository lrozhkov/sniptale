import type { ViewportPresetTarget } from '../../../features/viewport-presets/contracts';

export type CaptureSurfaceOwner = 'screenshot' | 'quick-action' | 'video';
export type CaptureSurfaceJournalPhase =
  | 'prepared'
  | 'applied'
  | 'suspended'
  | 'releasing'
  | 'conflict';

export type CaptureSurfaceSnapshot =
  | { type: 'native'; width: number; height: number }
  | {
      type: 'viewport';
      presetId: string;
      width: number;
      height: number;
    }
  | {
      type: 'window';
      left: number;
      top: number;
      width: number;
      height: number;
      state: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked-fullscreen';
    };

export interface CaptureSurfaceJournalEntry {
  version: 1;
  sessionId: string;
  leaseId: string;
  generation: number;
  owner: CaptureSurfaceOwner;
  tabId: number;
  windowId: number;
  presetId: string;
  target: ViewportPresetTarget;
  prior: CaptureSurfaceSnapshot;
  applied: CaptureSurfaceSnapshot;
  phase: CaptureSurfaceJournalPhase;
  parentLeaseId: string | null;
  updatedAt: number;
}
