import type {
  ViewportPresetAvailability,
  ViewportPresetTarget,
} from '../../features/viewport-presets/contracts';
import type {
  CaptureSurfaceJournalEntry,
  CaptureSurfaceOwner,
  CaptureSurfaceSnapshot,
} from '../storage/capture-surface/contracts';

export type CaptureSurfaceContext =
  | 'screenshot'
  | 'quick-action'
  | 'video-tab'
  | 'video-tab-crop'
  | 'video-screen';

export interface CaptureSurfaceLeaseRequest {
  sessionId: string;
  generation: number;
  owner: CaptureSurfaceOwner;
  tabId: number;
  presetId: string;
  context: CaptureSurfaceContext;
}

export interface AppliedCaptureSurface {
  sessionId: string;
  leaseId: string;
  generation: number;
  presetId: string;
  target: ViewportPresetTarget;
  width: number;
  height: number;
}

export interface AppliedCaptureSurfaceBinding {
  applied: AppliedCaptureSurface;
  tabId: number;
}

export interface CaptureSurfaceReleaseRequest {
  sessionId: string;
  leaseId: string;
  generation: number;
}

export type CaptureSurfaceLeaseIdentity = {
  generation: number;
  owner: CaptureSurfaceOwner;
  sessionId: string;
  tabId: number;
  target: ViewportPresetTarget;
};

export type BeforeAbandonedCaptureSurfaceRestore = (
  surface: CaptureSurfaceLeaseIdentity
) => Promise<void>;

export type BeforeAbandonedCaptureSurfaceStackRestore = (
  surfaces: readonly CaptureSurfaceLeaseIdentity[]
) => Promise<void>;

export type BeforeCaptureSurfaceOwnerRelease = (
  surface: CaptureSurfaceLeaseIdentity
) => Promise<void>;

export type CaptureSurfaceRecoveryOptions = {
  beforeAbandonedRestore?: BeforeAbandonedCaptureSurfaceRestore;
  beforeAbandonedStackRestore?: BeforeAbandonedCaptureSurfaceStackRestore;
  liveSessionIds?: ReadonlySet<string> | Promise<ReadonlySet<string>>;
};

export type CaptureSurfaceOwnerReleaseOptions = {
  beforeRelease?: BeforeCaptureSurfaceOwnerRelease;
};

export interface CaptureSurfaceService {
  apply(request: CaptureSurfaceLeaseRequest): Promise<AppliedCaptureSurface>;
  replace(request: CaptureSurfaceLeaseRequest): Promise<AppliedCaptureSurface>;
  getApplied(tabId: number): AppliedCaptureSurface | null;
  getAppliedBindingForSession(sessionId: string): AppliedCaptureSurfaceBinding | null;
  getAppliedForSession(sessionId: string): AppliedCaptureSurface | null;
  hasSessionLease(sessionId: string): boolean;
  handleDebuggerDetach(tabId: number): Promise<readonly CaptureSurfaceOwner[]>;
  hasOwnerLease(owner: CaptureSurfaceOwner): boolean;
  getAvailability(args: {
    tabId: number;
    presetId: string;
    context: CaptureSurfaceContext;
  }): Promise<ViewportPresetAvailability>;
  getAvailabilities(args: {
    tabId: number;
    presetIds: readonly string[];
    context: CaptureSurfaceContext;
  }): Promise<ViewportPresetAvailability[]>;
  recover(args?: CaptureSurfaceRecoveryOptions): Promise<void>;
  reassert(request: CaptureSurfaceReleaseRequest): Promise<void>;
  release(request: CaptureSurfaceReleaseRequest): Promise<void>;
  releaseOwners(
    owners: readonly CaptureSurfaceOwner[],
    options?: CaptureSurfaceOwnerReleaseOptions
  ): Promise<void>;
  releaseTabOwners(tabId: number, owners: readonly CaptureSurfaceOwner[]): Promise<void>;
  terminateClosedTab(tabId: number, owners: readonly CaptureSurfaceOwner[]): Promise<void>;
}

export class CaptureSurfaceError extends Error {
  constructor(
    readonly code:
      | 'missing'
      | 'disabled'
      | 'unsupported-context'
      | 'viewport-too-large'
      | 'window-too-large'
      | 'window-not-normal'
      | 'zoom-not-100'
      | 'surface-busy'
      | 'permission-denied'
      | 'platform-rejected'
      | 'verification-failed'
      | 'stale-generation'
      | 'restore-conflict'
      | 'restore-impossible',
    message: string = code
  ) {
    super(message);
    this.name = 'CaptureSurfaceError';
  }
}

export class CaptureSurfaceMutationError extends Error {
  constructor(
    message: string,
    readonly observedSnapshot: CaptureSurfaceSnapshot | null,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'CaptureSurfaceMutationError';
  }
}

export type CaptureSurfaceLeaseState = {
  applied: AppliedCaptureSurface;
  entry: CaptureSurfaceJournalEntry;
  ownedMutationSnapshot?: CaptureSurfaceSnapshot;
  prior: CaptureSurfaceSnapshot;
  viewportAcquisitionOwned: boolean;
};
