import type {
  SettingsTransferDomainPayload,
  SettingsTransferDynamicItem,
} from '../../../contracts/settings-transfer';
import {
  cloneSettingsTransferJsonValue,
  selectSettingsTransferModelMetadata,
} from '../../../contracts/settings-transfer';
import { selectSettingsTransferProviderMetadata } from '../../../contracts/settings-transfer';
import { getGradientPresetDisplayName } from '../../../features/highlighter/gradient-presets/display-name';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';
import { getSurfaceStylePresetDisplayName } from '../../../features/highlighter/surface-style/display-name';
import { getEditorPresetDisplayName } from '../../../features/editor/presets/display';
import { getViewportPresetDisplayName } from '../../../features/viewport-presets/display-name';
import type { AppLocale } from '../../../platform/i18n';
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
  locale: AppLocale;
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

  const locale: AppLocale = preferences[LOCALE_STORAGE_KEY] === 'en' ? 'en' : 'ru';
  return {
    domains,
    dynamicItems: collectSettingsTransferDynamicItems(domains, locale),
    dependencies: collectSettingsTransferDependencies(domains),
    locale,
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
  domains: Record<string, SettingsTransferDomainPayload>,
  locale?: AppLocale
): SettingsTransferDynamicItem[] {
  const result: SettingsTransferDynamicItem[] = [];
  addItems(result, domains, 'capture.quick-actions', 'items', locale, (item) =>
    typeof item['viewportPresetId'] === 'string'
      ? [`capture.viewport-presets.items.${item['viewportPresetId']}`]
      : []
  );
  addItems(result, domains, 'capture.viewport-presets', 'items', locale);
  addItems(result, domains, 'capture.video', 'profiles', locale);
  addItems(result, domains, 'capture.saving', 'templates', locale);
  addItems(result, domains, 'styles.borders', 'borderPresets', locale, annotationDependencies);
  addItems(result, domains, 'styles.callouts', 'presets', locale, annotationDependencies);
  addItems(result, domains, 'styles.numbering', 'presets', locale, annotationDependencies);
  addItems(result, domains, 'styles.tags', 'tags', locale);
  addEditorPresetItems(result, domains, locale);
  addPaletteItems(result, domains);
  addItems(result, domains, 'styles.surfaces', 'presets', locale);
  addItems(result, domains, 'styles.gradients', 'presets', locale);
  addItems(result, domains, 'ai.providers', 'items', locale);
  addItems(result, domains, 'ai.models', 'items', locale, (item) =>
    typeof item['providerId'] === 'string' ? [`ai.providers.items.${item['providerId']}`] : []
  );
  addItems(result, domains, 'ai.prompt-templates', 'items', locale);
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
  domains: Record<string, SettingsTransferDomainPayload>,
  locale?: AppLocale
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
        label:
          typeof item['name'] === 'string'
            ? getEditorPresetDisplayName(
                { name: item['name'], isSystemDefault: item['isSystemDefault'] === true },
                locale
              )
            : item['id'],
      });
    }
  }
}

function addItems(
  target: SettingsTransferDynamicItem[],
  domains: Record<string, SettingsTransferDomainPayload>,
  domainId: string,
  field: string,
  locale?: AppLocale,
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
      label: getItemDisplayName(item, domainId, locale),
      dependencies: dependencies(item),
    });
  }
}

function getItemDisplayName(
  item: Record<string, unknown>,
  domainId?: string,
  locale?: AppLocale
): string {
  const namedPreset = getNamedPresetIdentity(item);
  if (
    domainId === 'capture.viewport-presets' &&
    typeof item['kind'] === 'string' &&
    (typeof item['name'] === 'string' || typeof item['systemKey'] === 'string')
  ) {
    return getViewportPresetDisplayName(
      {
        kind: item['kind'],
        ...(typeof item['name'] === 'string' ? { name: item['name'] } : {}),
        ...(typeof item['nameOverride'] === 'string' ? { nameOverride: item['nameOverride'] } : {}),
        ...(typeof item['systemKey'] === 'string' ? { systemKey: item['systemKey'] } : {}),
      },
      locale
    );
  }
  if (namedPreset && domainId === 'styles.borders') {
    return getBorderPresetDisplayName(
      {
        ...namedPreset,
        customized: item['customized'] === true,
        ...(typeof item['systemPresetKey'] === 'string'
          ? { systemPresetKey: item['systemPresetKey'] }
          : {}),
      },
      locale
    );
  }
  if (namedPreset && domainId === 'styles.surfaces') {
    return getSurfaceStylePresetDisplayName(namedPreset, locale);
  }
  if (namedPreset && domainId === 'styles.gradients') {
    return getGradientPresetDisplayName(namedPreset, locale);
  }
  if (namedPreset && domainId === 'styles.callouts') {
    return getCalloutPresetDisplayName(getAnnotationPresetIdentity(item, namedPreset), locale);
  }
  if (namedPreset && domainId === 'styles.numbering') {
    return getStepBadgePresetDisplayName(getAnnotationPresetIdentity(item, namedPreset), locale);
  }
  for (const key of ['name', 'displayName', 'title', 'label', 'nameOverride'] as const) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return item['id'] as string;
}

function getAnnotationPresetIdentity(
  item: Record<string, unknown>,
  namedPreset: { id: string; name: string; origin: string }
) {
  return {
    ...namedPreset,
    customized: item['customized'] === true,
    ...(typeof item['systemPresetKey'] === 'string'
      ? { systemPresetKey: item['systemPresetKey'] }
      : {}),
  };
}

function getNamedPresetIdentity(item: Record<string, unknown>) {
  return typeof item['id'] === 'string' &&
    typeof item['name'] === 'string' &&
    typeof item['origin'] === 'string'
    ? { id: item['id'], name: item['name'], origin: item['origin'] }
    : null;
}

function resolveCollectionNodeId(domainId: string, field: string): string {
  if (field === 'presets' || field === 'borderPresets' || field === 'tags') {
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
