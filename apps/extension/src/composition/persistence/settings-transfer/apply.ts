import type {
  SettingsTransferChangeSummary,
  SettingsTransferDomainPayload,
} from '../../../contracts/settings-transfer';
import { parseSettingsTransferModelMetadata } from '../../../contracts/settings-transfer';
import type { AIProvider, NormalizedSettings } from '../../../contracts/settings';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { AIProviderTransferRollbackError, prepareAIProviderTransferMutation } from '../ai-settings';
import { serializeCalloutPresetCatalog } from '../callout-presets/migration';
import { loadVideoSettings } from '../capture-settings';
import { serializeStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { serializeSurfaceStylePresetCatalog } from '../surface-style-presets/parser';
import type { SurfaceStylePresetCatalog } from '../surface-style-presets/contracts';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { loadSettings } from '../settings';

const SYNC_KEYS = [
  'sniptale_settings',
  'sniptale_highlighter_settings',
  'sniptale_callout_presets',
  'sniptale_step_badge_presets',
  'sniptale_annotation_template_tags',
  'sniptale_gradient_presets',
  'sniptale_surface_style_presets',
] as const;
const LOCAL_KEYS = [
  'sniptale-theme-preference',
  'sniptale-locale-preference',
  'sniptale_popup_startup',
  'sniptale_quick_actions',
  'sniptale_video_settings',
  'sniptale_editor_presets',
  'sniptale_drawing_palette',
  'sniptale_prompt_templates',
  'sniptale_template_order',
  'sniptale_ai_models',
  'sniptale_ai_default_model',
  'sniptale_ai_chrome_enabled',
  'sniptale_ai_global_prompt',
  'sniptale_ai_scenario_editor_prompt',
] as const;

export class SettingsTransferQuotaError extends Error {}
export class SettingsTransferRollbackError extends Error {}

export async function applySettingsTransferDomains(args: {
  domains: Record<string, SettingsTransferDomainPayload>;
  summary: SettingsTransferChangeSummary;
  permit?: PersistenceMutationPermit;
}): Promise<void> {
  const [beforeSync, beforeLocal, currentSettings, currentVideo] = await Promise.all([
    browserStorage.sync.get([...SYNC_KEYS]),
    browserStorage.local.get([...LOCAL_KEYS]),
    loadSettings(),
    loadVideoSettings(),
  ]);
  const { syncWrites, localWrites } = buildWrites({
    currentSettings,
    currentVideo,
    domains: args.domains,
  });
  const importedProviders = readImportedProviders(args.domains);
  const providerPlan = importedProviders
    ? await prepareAIProviderTransferMutation({
        importedProviders,
        ...(args.permit === undefined ? {} : { permit: args.permit }),
      })
    : null;
  assertStorageBudget(syncWrites, localWrites);

  let syncCommitted = false;
  let providerCommitted = false;
  let localCommitted = false;
  try {
    if (Object.keys(syncWrites).length > 0) {
      await browserStorage.sync.set(syncWrites, args.permit);
      syncCommitted = true;
    }
    if (providerPlan) {
      await providerPlan.commit();
      providerCommitted = true;
    }
    if (Object.keys(localWrites).length > 0) {
      await browserStorage.local.set(localWrites, args.permit);
      localCommitted = true;
    }
    args.summary.clearedAiSecretBindings.push(...(providerPlan?.clearedProviderIds ?? []));
    args.summary.missingAiSecretBindings.push(...(providerPlan?.missingProviderIds ?? []));
  } catch (error) {
    let rollbackFailed = error instanceof AIProviderTransferRollbackError;
    const compensate = async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch {
        rollbackFailed = true;
      }
    };
    if (localCommitted)
      await compensate(() => restoreArea('local', beforeLocal, LOCAL_KEYS, args.permit));
    if (providerCommitted && providerPlan) await compensate(() => providerPlan.rollback());
    if (syncCommitted)
      await compensate(() => restoreArea('sync', beforeSync, SYNC_KEYS, args.permit));
    if (rollbackFailed) throw new SettingsTransferRollbackError('Settings import rollback failed');
    throw error;
  }
}

function buildWrites(args: {
  currentSettings: NormalizedSettings;
  currentVideo: Awaited<ReturnType<typeof loadVideoSettings>>;
  domains: Record<string, SettingsTransferDomainPayload>;
}) {
  const syncWrites: Record<string, unknown> = {};
  const localWrites: Record<string, unknown> = {};
  const nextSettings = structuredClone(args.currentSettings);
  const nextVideo = structuredClone(args.currentVideo);
  const data = (id: string) => asRecord(args.domains[id]?.data);
  const context: WriteBuildContext = {
    ...args,
    syncWrites,
    localWrites,
    nextSettings,
    nextVideo,
    data,
  };

  applySettingsWrites(context);
  applyVideoWrites(context);
  applyStyleWrites(context);
  applyAiWrites(context);
  return { syncWrites, localWrites };
}

type WriteBuildContext = {
  currentSettings: NormalizedSettings;
  currentVideo: Awaited<ReturnType<typeof loadVideoSettings>>;
  domains: Record<string, SettingsTransferDomainPayload>;
  syncWrites: Record<string, unknown>;
  localWrites: Record<string, unknown>;
  nextSettings: NormalizedSettings;
  nextVideo: Awaited<ReturnType<typeof loadVideoSettings>>;
  data: (id: string) => Record<string, unknown> | null;
};

function applySettingsWrites(context: WriteBuildContext): void {
  const { data, localWrites, nextSettings, syncWrites } = context;

  const preferences = data('interface.preferences');
  if (preferences) {
    if (preferences['theme'] !== undefined)
      localWrites['sniptale-theme-preference'] = preferences['theme'];
    if (preferences['locale'] !== undefined)
      localWrites['sniptale-locale-preference'] = preferences['locale'];
    if (preferences['popupStartup'] !== undefined)
      localWrites['sniptale_popup_startup'] = preferences['popupStartup'];
    if (preferences['contextMenu'] !== undefined)
      nextSettings.contextMenu = preferences['contextMenu'] as NormalizedSettings['contextMenu'];
  }
  const quickActions = data('capture.quick-actions');
  if (quickActions?.['items'] !== undefined)
    localWrites['sniptale_quick_actions'] = quickActions['items'];
  const viewports = data('capture.viewport-presets');
  if (viewports?.['items'] !== undefined)
    nextSettings.viewportPresets = viewports['items'] as NormalizedSettings['viewportPresets'];
  if (viewports?.['defaultId'] !== undefined)
    nextSettings.defaultViewportPresetId = viewports['defaultId'] as string | null;
  const image = data('capture.image');
  if (image?.['format'] !== undefined)
    nextSettings.imageFormat = image['format'] as NormalizedSettings['imageFormat'];
  if (image?.['quality'] !== undefined) nextSettings.imageQuality = image['quality'] as number;
  const afterCapture = data('capture.after-capture');
  if (afterCapture?.['action'] !== undefined)
    nextSettings.captureAction = afterCapture['action'] as NormalizedSettings['captureAction'];
  const saving = data('capture.saving');
  if (saving) {
    if (saving['templates'] !== undefined)
      nextSettings.presets = saving['templates'] as NonNullable<NormalizedSettings['presets']>;
    for (const key of [
      'defaultImagePresetId',
      'defaultVideoPresetId',
      'defaultExportPresetId',
    ] as const) {
      if (saving[key] !== undefined) nextSettings[key] = saving[key] as string | null;
    }
  }
  const retention = data('capture.retention');
  if (retention?.['policy'] !== undefined)
    nextSettings.localStoragePolicy = retention[
      'policy'
    ] as NormalizedSettings['localStoragePolicy'];
  const voice = data('system.voice');
  if (voice) {
    nextSettings.voiceInput = {
      language: voice['language'] as NonNullable<NormalizedSettings['voiceInput']>['language'],
      mode: voice['mode'] as NonNullable<NormalizedSettings['voiceInput']>['mode'],
      microphoneDeviceId: null,
    };
  }
  const access = data('access.capture-assets');
  if (access?.['authenticated'] !== undefined)
    nextSettings.authenticatedSnapshotAssetsEnabled = access['authenticated'] as boolean;
  if (access?.['anonymous'] !== undefined)
    nextSettings.anonymousCrossOriginSnapshotAssetsEnabled = access['anonymous'] as boolean;
  if (preferences || viewports || image || afterCapture || saving || retention || voice || access)
    syncWrites['sniptale_settings'] = nextSettings;
}

function applyVideoWrites(context: WriteBuildContext): void {
  const { data, localWrites, nextVideo } = context;
  const video = data('capture.video');
  if (video) {
    if (video['profiles'] !== undefined)
      nextVideo.qualityProfiles = video['profiles'] as typeof nextVideo.qualityProfiles;
    if (video['qualityProfileId'] !== undefined)
      nextVideo.qualityProfileId = video['qualityProfileId'] as string | null;
    if (video['outputProfile'] !== undefined)
      nextVideo.outputProfile = video['outputProfile'] as typeof nextVideo.outputProfile;
  }
  const native = data('system.native');
  if (native) {
    const currentNative = nextVideo.native!;
    const capture = asRecord(native['capture']);
    const captureVideo = asRecord(capture?.['video']);
    nextVideo.native = {
      ...currentNative,
      ...(capture?.['screenshots'] === undefined
        ? {}
        : { screenshots: capture['screenshots'] as typeof currentNative.screenshots }),
      ...(native['tray'] === undefined
        ? {}
        : { trayActions: native['tray'] as typeof currentNative.trayActions }),
      video: {
        ...currentNative.video,
        ...(captureVideo?.['advanced'] === undefined
          ? {}
          : { advanced: captureVideo['advanced'] as typeof currentNative.video.advanced }),
        ...(captureVideo?.['codec'] === undefined
          ? {}
          : { codec: captureVideo['codec'] as typeof currentNative.video.codec }),
        ...(captureVideo?.['enabled'] === undefined
          ? {}
          : { enabled: captureVideo['enabled'] as boolean }),
        ...(native['telemetry'] === undefined
          ? {}
          : { telemetry: native['telemetry'] as typeof currentNative.video.telemetry }),
      },
    };
  }
  if (video || native) localWrites['sniptale_video_settings'] = nextVideo;
}

function applyStyleWrites(context: WriteBuildContext): void {
  const { data, localWrites, syncWrites } = context;
  assign(syncWrites, 'sniptale_highlighter_settings', data('styles.borders'));
  const callouts = data('styles.callouts');
  if (callouts)
    syncWrites['sniptale_callout_presets'] = serializeCalloutPresetCatalog(
      requireCalloutCatalog(callouts)
    );
  const numbering = data('styles.numbering');
  if (numbering)
    syncWrites['sniptale_step_badge_presets'] = serializeStepBadgePresetCatalog(
      requireStepBadgeCatalog(numbering)
    );
  assign(syncWrites, 'sniptale_annotation_template_tags', data('styles.tags'));
  assign(localWrites, 'sniptale_editor_presets', data('styles.tool-presets'));
  const palette = data('styles.palettes');
  if (palette) {
    const slots = asRecord(palette['slots']) ?? {};
    const colors = Array.from({ length: 10 }, (_, index) => slots[`slot-${index}`]);
    if (colors.some((color) => typeof color !== 'string')) {
      throw new TypeError('Invalid drawing palette transfer state');
    }
    localWrites['sniptale_drawing_palette'] = {
      schemaVersion: 1,
      colors,
    };
  }
  assign(syncWrites, 'sniptale_gradient_presets', data('styles.gradients'));
  const surfaces = data('styles.surfaces');
  if (surfaces)
    syncWrites['sniptale_surface_style_presets'] = serializeSurfaceStylePresetCatalog(
      requireSurfaceStyleCatalog(surfaces)
    );
}

function applyAiWrites(context: WriteBuildContext): void {
  const { data, localWrites } = context;
  const templates = data('ai.prompt-templates');
  if (templates) {
    assign(localWrites, 'sniptale_prompt_templates', templates['items']);
    assign(localWrites, 'sniptale_template_order', templates['order']);
  }
  const models = data('ai.models');
  if (models) {
    if (Array.isArray(models['items'])) {
      localWrites['sniptale_ai_models'] = models['items'].map(parseSettingsTransferModelMetadata);
    }
    if (models['defaultModelId'] !== undefined) {
      localWrites['sniptale_ai_default_model'] = models['defaultModelId'];
    }
  }
  const chromeAi = data('ai.chrome');
  if (chromeAi) assign(localWrites, 'sniptale_ai_chrome_enabled', chromeAi['enabled']);
  const prompts = data('ai.prompts');
  if (prompts) {
    assign(localWrites, 'sniptale_ai_global_prompt', prompts['global']);
    assign(localWrites, 'sniptale_ai_scenario_editor_prompt', prompts['scenario']);
  }
}

function readImportedProviders(
  domains: Record<string, SettingsTransferDomainPayload>
): AIProvider[] | null {
  const providers = asRecord(domains['ai.providers']?.data);
  if (!providers || !Array.isArray(providers['items'])) return null;
  return providers['items'].map((value) => toImportedProvider(asRecord(value)!));
}

function toImportedProvider(imported: Record<string, unknown>): AIProvider {
  return {
    id: imported['id'] as string,
    name: imported['name'] as string,
    connectionType: imported['connectionType'] as AIProvider['connectionType'],
    baseUrl: imported['baseUrl'] as string,
    createdAt: imported['createdAt'] as number,
    hasStoredApiKey: false,
  };
}

function assertStorageBudget(
  syncWrites: Record<string, unknown>,
  localWrites: Record<string, unknown>
) {
  const encoder = new TextEncoder();
  let syncTotal = 0;
  for (const [key, value] of Object.entries(syncWrites)) {
    const bytes = encoder.encode(`${key}${JSON.stringify(value)}`).byteLength;
    if (bytes > 8_192) throw new SettingsTransferQuotaError(`Sync item quota exceeded: ${key}`);
    syncTotal += bytes;
  }
  if (syncTotal > 102_400) throw new SettingsTransferQuotaError('Sync storage quota exceeded');
  if (encoder.encode(JSON.stringify(localWrites)).byteLength > 10 * 1024 * 1024)
    throw new SettingsTransferQuotaError('Local storage quota exceeded');
}

async function restoreArea(
  area: 'local' | 'sync',
  before: Record<string, unknown>,
  keys: readonly string[],
  permit?: PersistenceMutationPermit
) {
  const adapter = browserStorage[area];
  const present = Object.fromEntries(
    keys.filter((key) => key in before).map((key) => [key, before[key]])
  );
  const missing = keys.filter((key) => !(key in before));
  if (Object.keys(present).length > 0) await adapter.set(present, permit);
  if (missing.length > 0) await adapter.remove(missing, permit);
  const verified = await adapter.get([...keys]);
  if (JSON.stringify(verified) !== JSON.stringify(present))
    throw new SettingsTransferRollbackError('Settings import rollback verification failed');
}

function assign(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) target[key] = value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireCalloutCatalog(value: unknown): CalloutPresetCatalog {
  if (!isCatalogRecord(value)) throw new TypeError('Invalid callout catalog transfer state');
  return value;
}

function requireStepBadgeCatalog(value: unknown): StepBadgePresetCatalog {
  if (!isCatalogRecord(value)) throw new TypeError('Invalid numbering catalog transfer state');
  return value;
}

function requireSurfaceStyleCatalog(value: unknown): SurfaceStylePresetCatalog {
  if (
    !isCatalogRecord(value) ||
    !Array.isArray(value.favoriteIds) ||
    typeof value.catalogRevision !== 'number' ||
    typeof value.systemCatalogRevision !== 'number' ||
    typeof value.unsafeForWrite !== 'boolean'
  )
    throw new TypeError('Invalid surface catalog transfer state');
  return value;
}

function isCatalogRecord(
  value: unknown
): value is CalloutPresetCatalog & StepBadgePresetCatalog & SurfaceStylePresetCatalog {
  const record = asRecord(value);
  return Boolean(
    record && Array.isArray(record['presets']) && typeof record['defaultPresetId'] === 'string'
  );
}
