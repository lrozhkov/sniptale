import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
import type { ViewportPreset } from '../../features/viewport-presets/contracts';
import type { FullPageCapturePreferences } from '../full-page-capture';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
export type {
  FullPageCapturePreferences,
  FullPageFloatingElementsMode,
} from '../full-page-capture';
export type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
export type {
  SystemViewportPreset,
  SystemViewportPresetKey,
  UserViewportPreset,
  ViewportPreset,
  ViewportPresetAvailability,
  ViewportPresetAvailabilityReason,
  ViewportPresetTarget,
} from '../../features/viewport-presets/contracts';

/**
 * Preset for a relative path inside Downloads.
 */
export interface SavePreset {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  order: number;
}

export interface ContextMenuSettings {
  enabled: boolean;
  showScreenshots: boolean;
  showVideo: boolean;
  showExport: boolean;
  showImageEditor: boolean;
  showVideoEditor: boolean;
  showGallery: boolean;
  showPageLinkCopy: boolean;
  showWindowResize: boolean;
  showSettings: boolean;
}

export type ContentToolbarDisplayMode = 'horizontal' | 'vertical';

export interface ContentToolbarPosition {
  x: number;
  y: number;
}

export interface ContentToolbarPreferences {
  displayMode: ContentToolbarDisplayMode;
  compactMenus: boolean;
  position: ContentToolbarPosition | null;
}

export type LocalStorageDestination = 'temporary' | 'library';

export interface LocalStoragePolicy {
  cleanupEnabled: boolean;
  defaultDestination: LocalStorageDestination;
  draftRetentionDays: number;
  videoDraftRetentionDays: number;
}

export interface Settings {
  captureAction: CaptureActionType;
  contentToolbar?: ContentToolbarPreferences;
  contextMenu: ContextMenuSettings;
  localStoragePolicy?: LocalStoragePolicy;
  /** @deprecated Read compatibility for settings written before localStoragePolicy. */
  saveCapturesToGallery: boolean;
  viewportPresets: ViewportPreset[];
  /** @deprecated Read compatibility only; capture flows require an explicit viewport selection. */
  defaultViewportPresetId: string | null;
  presets?: SavePreset[];
  defaultImagePresetId?: string | null;
  defaultVideoPresetId?: string | null;
  defaultExportPresetId?: string | null;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  authenticatedSnapshotAssetsEnabled: boolean;
  anonymousCrossOriginSnapshotAssetsEnabled: boolean;
  skipWebSnapshotSaveDisclosure: boolean;
  rawDiagnosticsEnabled: boolean;
  fullPageCapture?: FullPageCapturePreferences;
  voiceInput?: VoiceInputPreferences;
}

export type NormalizedSettings = Settings & { localStoragePolicy: LocalStoragePolicy };

export type SettingsPatch = Omit<
  Partial<Settings>,
  | 'contentToolbar'
  | 'contextMenu'
  | 'defaultViewportPresetId'
  | 'fullPageCapture'
  | 'localStoragePolicy'
  | 'saveCapturesToGallery'
  | 'voiceInput'
> & {
  contentToolbar?: Partial<ContentToolbarPreferences>;
  contextMenu?: Partial<ContextMenuSettings>;
  fullPageCapture?: Partial<FullPageCapturePreferences>;
  localStoragePolicy?: Partial<LocalStoragePolicy>;
  voiceInput?: Partial<VoiceInputPreferences>;
};

export type AIConnectionType = 'chrome-built-in' | 'openai-compatible';

export interface AIProvider {
  id: string;
  name: string;
  connectionType: AIConnectionType;
  baseUrl: string;
  hasStoredApiKey: boolean;
  createdAt: number;
}

export interface AIModel {
  id: string;
  providerId: string;
  modelCode: string;
  displayName: string;
  systemPrompt?: string | undefined;
}

export interface AISettings {
  chromeAiEnabled: boolean;
  providers: AIProvider[];
  models: AIModel[];
  defaultModelId: string | null;
  globalSystemPrompt: string;
  scenarioEditorSystemPrompt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  enabled?: boolean;
  customized?: boolean;
  systemRevision?: number;
  lastUsedAt?: number;
}

export type QuickActionScreenshotMode = 'visible' | 'full' | 'selection' | 'desktop';

import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_INFO,
  DEFAULT_COLOR_SELECTION,
  DEFAULT_COLOR_SUCCESS,
} from '@sniptale/ui/default-colors/constants';

export type QuickActionDelay = 0 | 3 | 5 | 10;

export interface HotkeyConfig {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface QuickActionOverlay {
  afterCapture: CaptureActionType;
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  exitAfterCapture: boolean;
}

export type QuickActionOrigin = 'bundled' | 'user';

export type BundledQuickActionId =
  | 'default-visible-download'
  | 'default-full-page-download'
  | 'default-selection-download'
  | 'default-visible-copy'
  | 'default-visible-edit'
  | 'default-desktop-capture'
  | 'default-visible-library';

export const SCREENSHOT_MODE_COLORS: Record<QuickActionScreenshotMode, string> = {
  visible: DEFAULT_COLOR_ACCENT,
  full: DEFAULT_COLOR_INFO,
  selection: DEFAULT_COLOR_SELECTION,
  desktop: DEFAULT_COLOR_SUCCESS,
};

export interface QuickAction {
  id: string;
  status: boolean;
  name: string;
  icon: string;
  origin?: QuickActionOrigin;
  bundledId?: BundledQuickActionId | null;
  customized?: boolean;
  hotkey?: HotkeyConfig | null;
  screenshotMode: QuickActionScreenshotMode;
  viewportPresetId?: string | null;
  delay?: QuickActionDelay | null;
  afterCapture?: CaptureActionType | null;
  imageFormat?: 'png' | 'jpeg' | 'webp' | null;
  imageQuality?: number | null;
  exitAfterCapture: boolean;
}
