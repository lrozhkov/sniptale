import type { CaptureMode } from '../video/types/types';

export interface CapabilityState {
  supported: boolean;
  reason: string | null;
}

export interface ActiveTabCapabilities {
  tabId: number | null;
  url: string | null;
  title: string | null;
  isRestrictedPage: boolean;
  restrictedPageLabel: string | null;
  screenshotMode: CapabilityState;
  quickActions: CapabilityState;
  export: CapabilityState;
  videoByMode: Record<CaptureMode, CapabilityState>;
}

export const TabRuntimeCapability = {
  OwnedSnapshotViewer: 'ownedSnapshotViewer',
  Regular: 'regular',
  Restricted: 'restricted',
} as const;

export type TabRuntimeCapability = (typeof TabRuntimeCapability)[keyof typeof TabRuntimeCapability];
