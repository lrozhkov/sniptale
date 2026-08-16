import type {
  SettingsTransferDomainPayload,
  SettingsTransferDynamicItem,
} from '../../../contracts/settings-transfer';
import {
  cloneSettingsTransferJsonValue,
  selectSettingsTransferModelMetadata,
} from '../../../contracts/settings-transfer';
import { selectSettingsTransferProviderMetadata } from '../../../contracts/settings-transfer';
import { loadAISettings } from '../ai-settings';
import { loadAnnotationTemplateTagState } from '../annotation-template-tags';
import { loadCalloutPresetCatalog } from '../callout-presets';
import { serializeCalloutPresetCatalog } from '../callout-presets/migration';
import { loadVideoSettings } from '../capture-settings';
import { loadPopupStartupState } from '../capture-settings/popup-startup';
import { loadDrawingPaletteState } from '../drawing-palette';
import { loadEditorPresetState } from '../editor-presets';
import { loadGradientPresetCatalog } from '../gradient-presets';
import { loadHighlighterSettings } from '../highlighter';
import { browserStorage } from '../infrastructure/browser-storage';
import { getPromptTemplates, loadTemplateOrder } from '../prompt-templates';
import { getQuickActions } from '../quick-actions';
import { loadSettings } from '../settings';
import { loadStepBadgePresetCatalog } from '../step-badge-presets';
import { serializeStepBadgePresetCatalog } from '../step-badge-presets/migration';
import { loadSurfaceStylePresetCatalog } from '../surface-style-presets';
import { serializeSurfaceStylePresetCatalog } from '../surface-style-presets/parser';

const THEME_STORAGE_KEY = 'sniptale-theme-preference';
const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';

export interface SettingsTransferSnapshot {
  domains: Record<string, SettingsTransferDomainPayload>;
  dynamicItems: SettingsTransferDynamicItem[];
  dependencies: Record<string, string[]>;
}

export async function readSettingsTransferSnapshot(): Promise<SettingsTransferSnapshot> {
  const [
    settings,
    quickActions,
    video,
    popupStartup,
    highlighter,
    callouts,
    numbering,
    tags,
    editorPresets,
    palette,
    gradients,
    surfaces,
    ai,
    promptTemplates,
    templateOrder,
    preferences,
  ] = await Promise.all([
    loadSettings(),
    getQuickActions(),
    loadVideoSettings(),
    loadPopupStartupState(),
    loadHighlighterSettings(),
    loadCalloutPresetCatalog(),
    loadStepBadgePresetCatalog(),
    loadAnnotationTemplateTagState(),
    loadEditorPresetState(),
    loadDrawingPaletteState(),
    loadGradientPresetCatalog(),
    loadSurfaceStylePresetCatalog(),
    loadAISettings(),
    getPromptTemplates(),
    loadTemplateOrder(),
    browserStorage.local.get([THEME_STORAGE_KEY, LOCALE_STORAGE_KEY]),
  ]);

  const providers = ai.providers.map(selectSettingsTransferProviderMetadata);
  const domains: Record<string, SettingsTransferDomainPayload> = {
    'interface.preferences': payload({
      theme: preferences[THEME_STORAGE_KEY] ?? 'system',
      locale: preferences[LOCALE_STORAGE_KEY] ?? 'ru',
      popupStartup,
      contextMenu: settings.contextMenu,
    }),
    'capture.quick-actions': payload({ items: quickActions }),
    'capture.viewport-presets': payload({
      items: settings.viewportPresets,
      defaultId: settings.defaultViewportPresetId,
    }),
    'capture.image': payload({ format: settings.imageFormat, quality: settings.imageQuality }),
    'capture.video': payload({
      profiles: video.qualityProfiles,
      qualityProfileId: video.qualityProfileId,
      outputProfile: video.outputProfile,
    }),
    'capture.after-capture': payload({ action: settings.captureAction }),
    'capture.saving': payload({
      templates: settings.presets ?? [],
      defaultImagePresetId: settings.defaultImagePresetId ?? null,
      defaultVideoPresetId: settings.defaultVideoPresetId ?? null,
      defaultExportPresetId: settings.defaultExportPresetId ?? null,
    }),
    'capture.retention': payload({ policy: settings.localStoragePolicy }),
    'styles.borders': payload(highlighter),
    'styles.callouts': payload(serializeCalloutPresetCatalog(callouts)),
    'styles.numbering': payload(serializeStepBadgePresetCatalog(numbering)),
    'styles.tags': payload(tags),
    'styles.tool-presets': payload(editorPresets),
    'styles.palettes': payload({
      slots: Object.fromEntries(palette.colors.map((color, index) => [`slot-${index}`, color])),
    }),
    'styles.surfaces': payload(serializeSurfaceStylePresetCatalog(surfaces)),
    'styles.gradients': payload(gradients),
    'ai.providers': payload({ items: providers }),
    'ai.models': payload({
      items: ai.models.map(selectSettingsTransferModelMetadata),
      defaultModelId: ai.defaultModelId,
    }),
    'ai.chrome': payload({ enabled: ai.chromeAiEnabled }),
    'ai.prompts': payload({
      global: ai.globalSystemPrompt,
      scenario: ai.scenarioEditorSystemPrompt,
    }),
    'ai.prompt-templates': payload({ items: promptTemplates, order: templateOrder }),
    'system.voice': payload({
      language: settings.voiceInput?.language ?? 'ru-RU',
      mode: settings.voiceInput?.mode ?? 'local-first',
    }),
    'system.native': payload({
      capture: video.native
        ? {
            screenshots: video.native.screenshots,
            video: {
              advanced: video.native.video.advanced,
              codec: video.native.video.codec,
              enabled: video.native.video.enabled,
            },
          }
        : undefined,
      tray: video.native?.trayActions,
      telemetry: video.native?.video.telemetry,
    }),
    'access.capture-assets': payload({
      authenticated: settings.authenticatedSnapshotAssetsEnabled,
      anonymous: settings.anonymousCrossOriginSnapshotAssetsEnabled,
    }),
  };

  return {
    domains,
    dynamicItems: collectSettingsTransferDynamicItems(domains),
    dependencies: collectSettingsTransferDependencies(domains),
  };
}

export function collectSettingsTransferDependencies(
  domains: Record<string, SettingsTransferDomainPayload>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const viewport = asRecord(domains['capture.viewport-presets']?.data);
  if (typeof viewport?.['defaultId'] === 'string') {
    result['capture.viewport-presets.default'] = [
      `capture.viewport-presets.items.${viewport['defaultId']}`,
    ];
  }
  const saving = asRecord(domains['capture.saving']?.data);
  const savingDependencies = [
    saving?.['defaultImagePresetId'],
    saving?.['defaultVideoPresetId'],
    saving?.['defaultExportPresetId'],
  ]
    .filter((id): id is string => typeof id === 'string')
    .map((id) => `capture.saving.templates.${id}`);
  if (savingDependencies.length > 0) result['capture.saving.defaults'] = savingDependencies;
  const models = asRecord(domains['ai.models']?.data);
  if (typeof models?.['defaultModelId'] === 'string') {
    result['ai.models.default'] = [`ai.models.items.${models['defaultModelId']}`];
  }
  return result;
}

function payload(value: unknown): SettingsTransferDomainPayload {
  return { schemaVersion: 1, data: cloneSettingsTransferJsonValue(value) };
}

export function collectSettingsTransferDynamicItems(
  domains: Record<string, SettingsTransferDomainPayload>
): SettingsTransferDynamicItem[] {
  const result: SettingsTransferDynamicItem[] = [];
  addItems(result, domains, 'capture.quick-actions', 'items', (item) =>
    typeof item['viewportPresetId'] === 'string'
      ? [`capture.viewport-presets.items.${item['viewportPresetId']}`]
      : []
  );
  addItems(result, domains, 'capture.viewport-presets', 'items');
  addItems(result, domains, 'capture.video', 'profiles');
  addItems(result, domains, 'capture.saving', 'templates');
  addItems(result, domains, 'styles.borders', 'borderPresets', annotationDependencies);
  addItems(result, domains, 'styles.callouts', 'presets', annotationDependencies);
  addItems(result, domains, 'styles.numbering', 'presets', annotationDependencies);
  addItems(result, domains, 'styles.tags', 'tags');
  addEditorPresetItems(result, domains);
  addPaletteItems(result, domains);
  addItems(result, domains, 'styles.surfaces', 'presets');
  addItems(result, domains, 'styles.gradients', 'presets');
  addItems(result, domains, 'ai.providers', 'items');
  addItems(result, domains, 'ai.models', 'items', (item) =>
    typeof item['providerId'] === 'string' ? [`ai.providers.items.${item['providerId']}`] : []
  );
  addItems(result, domains, 'ai.prompt-templates', 'items');
  return result;
}

function addPaletteItems(
  target: SettingsTransferDynamicItem[],
  domains: Record<string, SettingsTransferDomainPayload>
): void {
  const data = asRecord(domains['styles.palettes']?.data);
  const slots = asRecord(data?.['slots']);
  for (const [id, color] of Object.entries(slots ?? {})) {
    if (typeof color !== 'string') continue;
    target.push({ collectionNodeId: 'styles.palettes.items', id, label: color });
  }
}

function addEditorPresetItems(
  target: SettingsTransferDynamicItem[],
  domains: Record<string, SettingsTransferDomainPayload>
): void {
  const data = asRecord(domains['styles.tool-presets']?.data);
  for (const family of ['step', 'sceneBackground'] as const) {
    const collection = asRecord(data?.[family]);
    const presets = Array.isArray(collection?.['presets']) ? collection['presets'] : [];
    for (const preset of presets) {
      const item = asRecord(preset);
      if (!item || typeof item['id'] !== 'string') continue;
      target.push({
        collectionNodeId: 'styles.tool-presets.items',
        id: `${family}:${item['id']}`,
        label: typeof item['name'] === 'string' ? item['name'] : item['id'],
      });
    }
  }
}

function addItems(
  target: SettingsTransferDynamicItem[],
  domains: Record<string, SettingsTransferDomainPayload>,
  domainId: string,
  field: string,
  dependencies: (item: Record<string, unknown>) => string[] = () => []
): void {
  const data = asRecord(domains[domainId]?.data);
  const values = Array.isArray(data?.[field]) ? data[field] : [];
  for (const value of values) {
    const item = asRecord(value);
    if (!item || typeof item['id'] !== 'string') continue;
    target.push({
      collectionNodeId: resolveCollectionNodeId(domainId, field),
      id: item['id'],
      label: typeof item['name'] === 'string' ? item['name'] : item['id'],
      dependencies: dependencies(item),
    });
  }
}

function resolveCollectionNodeId(domainId: string, field: string): string {
  if (
    field === 'presets' ||
    field === 'profiles' ||
    field === 'borderPresets' ||
    field === 'tags'
  ) {
    return `${domainId}.items`;
  }
  return `${domainId}.${field}`;
}

function annotationDependencies(item: Record<string, unknown>): string[] {
  const tagIds = Array.isArray(item['tagIds'])
    ? item['tagIds'].filter((id): id is string => typeof id === 'string')
    : [];
  const linkedTemplates = asRecord(item['linkedTemplates']);
  return [
    ...tagIds.map((id) => `styles.tags.items.${id}`),
    ...(typeof linkedTemplates?.['calloutPresetId'] === 'string'
      ? [`styles.callouts.items.${linkedTemplates['calloutPresetId']}`]
      : []),
    ...(typeof linkedTemplates?.['stepBadgePresetId'] === 'string'
      ? [`styles.numbering.items.${linkedTemplates['stepBadgePresetId']}`]
      : []),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
