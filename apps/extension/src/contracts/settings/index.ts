import type { AIProviderType, AIModelManagement } from './ai-provider';
import type {
  AIModelCapabilities,
  AICatalogFacts,
  AIModelSource,
  AIConnectionObservation,
} from './ai-catalog';
import type { PageLaunchPreferences } from '../page-launch';
import type { QuickActionAppearance } from '../quick-action-appearance';
import type { AIModelAudioParameters, AIModelOperation } from './model-operation';
import type { CaptureActionType } from '@sniptale/runtime-contracts/capture/action';
import type { ViewportPreset } from '../../features/viewport-presets/contracts';
import type { FullPageCapturePreferences, FullPageQualityPolicy } from '../full-page-capture';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
import type { PagePackageCaptureTimingPolicy } from '@sniptale/runtime-contracts/page-package';
import type { ExportResourceLimits } from '@sniptale/runtime-contracts/export';
export type {
  FullPageCapturePreferences,
  FullPageFloatingElementsMode,
  FullPageQualityPolicy,
  FullPageQualityProfile,
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
  /** Missing layout retains the original root ordering. */
  layout?: import('./context-menu-layout').ContextMenuLayout;
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
export const CONTENT_TOOLBAR_DOCK_EDGES = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left-top',
  'left-bottom',
  'right-top',
  'right-bottom',
] as const;
export type ContentToolbarDockEdge = (typeof CONTENT_TOOLBAR_DOCK_EDGES)[number];

export interface ContentToolbarPosition {
  x: number;
  y: number;
}

export const RECORDING_TOOLBAR_CONTROLS = [
  'select',
  'pencil',
  'marker',
  'text',
  'shape',
  'arrow',
  'blur',
  'eraser',
  'clear',
  'cursor',
  'microphone',
  'camera',
] as const;
export type RecordingToolbarControl = (typeof RECORDING_TOOLBAR_CONTROLS)[number];

export const PAGE_TOOLBAR_CONTROLS = [
  'auto-blur',
  'capture-visible',
  'capture-selection',
  'capture-full',
  'after-capture',
  'capture-delay',
  'capture-size',
  'quick-actions',
  'scenario-panel',
  'drawing-pencil',
  'drawing-marker',
  'drawing-text',
  'drawing-shape',
  'drawing-arrow',
  'drawing-blur',
  'annotation-callout',
  'annotation-step-badge',
  'editing-direct-text',
  'editing-ai',
  'editing-marker',
  'editing-ai-text',
  'review-comment',
  'review-inspect',
  'review-compare',
  'review-move',
  'review-check',
  'review-panel',
  'review-measurements',
  'review-layout-guides',
  'review-export',
] as const;
export type PageToolbarControl = (typeof PAGE_TOOLBAR_CONTROLS)[number];

export const PAGE_TOOLBAR_OVERRIDE_MODES = [
  'drawing',
  'highlighter',
  'quick-edit',
  'design-review',
] as const;
export type PageToolbarMode = 'cursor' | (typeof PAGE_TOOLBAR_OVERRIDE_MODES)[number];
export type PageToolbarControlOverrides = Partial<
  Record<Exclude<PageToolbarMode, 'cursor'>, Partial<Record<PageToolbarControl, boolean | null>>>
>;

/** Page layout identifiers exclude the fixed toolbar drag handle and recording controls. */
export const PAGE_TOOLBAR_REQUIRED_ITEMS = [
  'mode',
  'drawing-select',
  'editing-block-selection',
  'annotation-effects',
  'history-undo',
  'history-redo',
  'history-reset',
  'history-restore',
  'pin-to-tab',
  'collapse',
  'settings',
] as const;
export const PAGE_TOOLBAR_LAYOUT_MODES = ['cursor', ...PAGE_TOOLBAR_OVERRIDE_MODES] as const;
export const PAGE_TOOLBAR_LAYOUT_MAX_ITEMS = 96;
export const PAGE_TOOLBAR_LAYOUT_MAX_DIVIDERS = 32;
export type PageToolbarLayoutItem =
  | PageToolbarControl
  | (typeof PAGE_TOOLBAR_REQUIRED_ITEMS)[number]
  | `separator:${string}`;
export type PageToolbarLayouts = Partial<Record<PageToolbarMode, PageToolbarLayoutItem[] | null>>;

/** Admits bounded button identities and opaque divider identities; it grants no action authority. */
export function isPageToolbarLayoutItem(value: unknown): value is PageToolbarLayoutItem {
  return (
    typeof value === 'string' &&
    (PAGE_TOOLBAR_CONTROLS.some((item) => item === value) ||
      PAGE_TOOLBAR_REQUIRED_ITEMS.some((item) => item === value) ||
      /^separator:[a-z0-9-]{1,48}$/.test(value))
  );
}

export interface ContentToolbarPreferences {
  /** Null or absence restores the default order and separators for that page mode. */
  pageLayouts?: PageToolbarLayouts;
  /** Shared non-recording toolbar choices. Missing controls remain visible. */
  pageControls?: Partial<Record<PageToolbarControl, boolean>>;
  /** Mode choices override shared defaults. Null restores inheritance for one control. */
  pageControlOverrides?: PageToolbarControlOverrides;
  cropMode?: 'drawing' | 'resize';
  /** Missing controls remain visible during recording. This does not enable their tools. */
  recordingControls?: Partial<Record<RecordingToolbarControl, boolean>>;
  /** Missing values enable fading during recording. */
  fadeDuringRecording?: boolean;
  /** Legacy absence uses docking at the top edge. */
  freePlacement?: boolean;
  dockEdge?: ContentToolbarDockEdge;
  displayMode: ContentToolbarDisplayMode;
  compactMenus: boolean;
  position: ContentToolbarPosition | null;
}

export type LocalStorageDestination = 'temporary' | 'library';

export interface LocalStoragePolicy {
  cleanupEnabled: boolean;
  /** New image captures; also the migration fallback for legacy recording preferences. */
  defaultDestination: LocalStorageDestination;
  recordingDestination?: LocalStorageDestination;
  webSnapshotDestination?: LocalStorageDestination;
  draftRetentionDays: number;
  videoDraftRetentionDays: number;
  /** Missing legacy values disable automatic permanent deletion from trash. */
  trashCleanupEnabled?: boolean;
  /** Days since trash admission; normalized settings default to 30. */
  trashRetentionDays?: number;
}

import type { FilenameRules } from '../../features/file-naming/rules';

export interface Settings {
  pageLaunch?: PageLaunchPreferences;
  /** Undefined selects defaults; null records an unusable stored rule and selects strict fallback. */
  filenameRules?: FilenameRules | null;
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
  fullPageQuality?: FullPageQualityPolicy;
  authenticatedSnapshotAssetsEnabled: boolean;
  anonymousCrossOriginSnapshotAssetsEnabled: boolean;
  externalSnapshotAssetRedirectsEnabled?: boolean;
  externalSnapshotLinksEnabled?: boolean;
  fullPageCapture?: FullPageCapturePreferences;
  exportResourceLimits?: ExportResourceLimits;
  pagePackageCaptureTiming?: PagePackageCaptureTimingPolicy;
  voiceInput?: VoiceInputPreferences;
}

export type NormalizedSettings = Omit<
  Settings,
  | 'externalSnapshotAssetRedirectsEnabled'
  | 'externalSnapshotLinksEnabled'
  | 'exportResourceLimits'
  | 'fullPageQuality'
  | 'localStoragePolicy'
  | 'pagePackageCaptureTiming'
> & {
  externalSnapshotAssetRedirectsEnabled: boolean;
  externalSnapshotLinksEnabled: boolean;
  exportResourceLimits: ExportResourceLimits;
  fullPageQuality: FullPageQualityPolicy;
  localStoragePolicy: LocalStoragePolicy;
  pagePackageCaptureTiming: PagePackageCaptureTimingPolicy;
};

export type SettingsPatch = Omit<
  Partial<Settings>,
  | 'contentToolbar'
  | 'pageLaunch'
  | 'contextMenu'
  | 'defaultViewportPresetId'
  | 'fullPageCapture'
  | 'exportResourceLimits'
  | 'fullPageQuality'
  | 'localStoragePolicy'
  | 'pagePackageCaptureTiming'
  | 'saveCapturesToGallery'
  | 'voiceInput'
> & {
  contentToolbar?: Partial<ContentToolbarPreferences>;
  pageLaunch?: Partial<PageLaunchPreferences>;
  contextMenu?: Partial<ContextMenuSettings>;
  fullPageCapture?: Partial<FullPageCapturePreferences>;
  exportResourceLimits?: Partial<ExportResourceLimits>;
  fullPageQuality?: FullPageQualityPolicy;
  localStoragePolicy?: Partial<LocalStoragePolicy>;
  pagePackageCaptureTiming?: PagePackageCaptureTimingPolicy;
  voiceInput?: Partial<VoiceInputPreferences>;
};

export type AIConnectionType = AIProviderType;

export interface AIProvider {
  management?: AIModelManagement | undefined;
  enabled?: boolean | undefined;
  incarnation?: string | undefined;
  revision?: number | undefined;
  credentialRevision?: number | undefined;
  observation?: AIConnectionObservation | undefined;
  catalogUpdatedAt?: number | undefined;
  lastRefreshAttemptAt?: number | undefined;
  refreshGeneration?: string | undefined;
  id: string;
  name: string;
  connectionType: AIConnectionType;
  baseUrl: string;
  hasStoredApiKey: boolean;
  createdAt: number;
}

export interface AIModel {
  source?: AIModelSource | undefined;
  enabled?: boolean | undefined;
  capabilities?: AIModelCapabilities | undefined;
  catalog?: AICatalogFacts | undefined;
  retirementOverride?: boolean | undefined;
  operation?: AIModelOperation | undefined;
  audio?: AIModelAudioParameters | undefined;
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
  audioTranscriptionSystemPrompt?: string;
  voiceInputCorrectionSystemPrompt?: string;
}

export interface PromptTemplate {
  scope?: 'page' | 'scenario';
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  enabled?: boolean | undefined;
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
  transactionId?: string;
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
  appearance?: QuickActionAppearance;
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
