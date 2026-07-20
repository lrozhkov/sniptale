import type { MediaLibraryEntry } from '../../../apps/extension/src/composition/persistence/media-library/contracts';
import type { EditorBootstrapPayload } from '../../../apps/extension/src/workflows/editor/bootstrap';
import type { HarnessMediaLibraryAsset } from './browser-mocks.media-library';
import type { VideoProject } from '../../../apps/extension/src/features/video/project/types';

export type RuntimeResponseOverride = unknown | ((message: unknown) => Promise<unknown> | unknown);
type RuntimeResponseOverrideHandler = (message: unknown) => Promise<unknown> | unknown;

export type HarnessActiveTab = {
  id: number;
  active: boolean;
  title: string;
  url: string;
  windowId: number;
};

export type HarnessCreatedTab = {
  id?: number;
  url: string;
};

export type HarnessClipboardWrite = {
  itemCount: number;
  types: string[];
};

type HarnessRuntimeFallbackMode = 'known-only' | 'typed-success';
type HarnessTabSendMessageMode = 'error' | 'success';
type HarnessMediaGetUserMediaMode = 'denied' | 'success';

export type SniptaleHarnessApiBehavior = {
  runtimeFallback: HarnessRuntimeFallbackMode;
  tabSendMessage: HarnessTabSendMessageMode;
  permissions: {
    contains: boolean;
    request: boolean;
  };
  mediaDevices: {
    getUserMedia: HarnessMediaGetUserMediaMode;
  };
};

export type SniptaleHarnessApiBehaviorOverrides = {
  runtimeFallback?: HarnessRuntimeFallbackMode;
  tabSendMessage?: HarnessTabSendMessageMode;
  permissions?: Partial<SniptaleHarnessApiBehavior['permissions']>;
  mediaDevices?: Partial<SniptaleHarnessApiBehavior['mediaDevices']>;
};

export type SniptaleHarnessBridge = {
  reset: () => Promise<void>;
  seedStorage: (items: Record<string, unknown>) => void;
  seedMediaLibrary: (assets: HarnessMediaLibraryAsset[]) => Promise<void>;
  getStorageState: () => Record<string, unknown>;
  getMediaLibraryState: () => Promise<MediaLibraryEntry[]>;
  getRuntimeMessages: () => unknown[];
  emitRuntimeMessage: (message: unknown) => void;
  emitTrustedOffscreenRuntimeMessage: (message: { type: string } & Record<string, unknown>) => void;
  getCreatedTabs: () => HarnessCreatedTab[];
  getClipboardWrites: () => HarnessClipboardWrite[];
  setRuntimeResponse: (messageType: string, response: RuntimeResponseOverride) => void;
  clearRuntimeResponses: () => void;
  setApiBehavior: (behavior: SniptaleHarnessApiBehaviorOverrides) => void;
  resetApiBehavior: () => void;
  setActiveTab: (tab: Partial<HarnessActiveTab>) => void;
};

export type SniptaleHarnessBootstrap = {
  storage?: Record<string, unknown>;
  mediaLibrary?: HarnessMediaLibraryAsset[];
  videoProjects?: VideoProject[];
  runtimeResponses?: Record<string, RuntimeResponseOverride>;
  activeTab?: Partial<HarnessActiveTab>;
  apiBehavior?: SniptaleHarnessApiBehaviorOverrides;
  editorBootstrapPayload?: EditorBootstrapPayload;
  editorAutoApplyBrowserFrame?: boolean;
};

export const DEFAULT_ACTIVE_TAB: HarnessActiveTab = {
  id: 1,
  active: true,
  title: 'Harness tab',
  url: 'https://example.com/',
  windowId: 1,
};

export const DEFAULT_HARNESS_API_BEHAVIOR: SniptaleHarnessApiBehavior = {
  runtimeFallback: 'known-only',
  tabSendMessage: 'error',
  permissions: {
    contains: false,
    request: false,
  },
  mediaDevices: {
    getUserMedia: 'denied',
  },
};

export function createHarnessApiBehavior(
  overrides: SniptaleHarnessApiBehaviorOverrides = {},
  base: SniptaleHarnessApiBehavior = DEFAULT_HARNESS_API_BEHAVIOR
): SniptaleHarnessApiBehavior {
  return {
    runtimeFallback: overrides.runtimeFallback ?? base.runtimeFallback,
    tabSendMessage: overrides.tabSendMessage ?? base.tabSendMessage,
    permissions: {
      contains: overrides.permissions?.contains ?? base.permissions.contains,
      request: overrides.permissions?.request ?? base.permissions.request,
    },
    mediaDevices: {
      getUserMedia: overrides.mediaDevices?.getUserMedia ?? base.mediaDevices.getUserMedia,
    },
  };
}

export function isRuntimeResponseOverrideHandler(
  value: RuntimeResponseOverride | undefined
): value is RuntimeResponseOverrideHandler {
  return typeof value === 'function';
}
