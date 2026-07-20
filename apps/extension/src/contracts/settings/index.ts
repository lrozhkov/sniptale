import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
export type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';

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

/**
 * Post-capture action / save target.
 */
export interface ViewportPreset {
  id: string;
  width: number;
  height: number;
  label: string;
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

export interface Settings {
  captureAction: CaptureActionType;
  contentToolbar?: ContentToolbarPreferences;
  contextMenu: ContextMenuSettings;
  saveCapturesToGallery: boolean;
  viewportPresets?: ViewportPreset[];
  defaultViewportId?: string | null;
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
}

export type SettingsPatch = Omit<Partial<Settings>, 'contentToolbar' | 'contextMenu'> & {
  contentToolbar?: Partial<ContentToolbarPreferences>;
  contextMenu?: Partial<ContextMenuSettings>;
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
  lastUsedAt?: number;
}

export type QuickActionScreenshotMode = 'visible' | 'full' | 'selection';

import {
  DEFAULT_COLOR_ACCENT,
  DEFAULT_COLOR_INFO,
  DEFAULT_COLOR_SELECTION,
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
  | 'default-fullscreen'
  | 'default-edit-visible'
  | 'default-selection'
  | 'default-delayed-visible'
  | 'default-copy-visible'
  | 'default-copy-selection';

export type QuickActionsDisplayMode = 'hidden' | 'list';

export const SCREENSHOT_MODE_COLORS: Record<QuickActionScreenshotMode, string> = {
  visible: DEFAULT_COLOR_ACCENT,
  full: DEFAULT_COLOR_INFO,
  selection: DEFAULT_COLOR_SELECTION,
};

export interface QuickAction {
  id: string;
  status: boolean;
  name: string;
  icon: string;
  origin?: QuickActionOrigin;
  bundledId?: BundledQuickActionId | null;
  hotkey?: HotkeyConfig | null;
  screenshotMode: QuickActionScreenshotMode;
  emulation?: string | null;
  delay?: QuickActionDelay | null;
  afterCapture?: CaptureActionType | null;
  imageFormat?: 'png' | 'jpeg' | 'webp' | null;
  imageQuality?: number | null;
  exitAfterCapture: boolean;
}
