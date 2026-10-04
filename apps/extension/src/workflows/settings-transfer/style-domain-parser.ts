import { parseEffectCatalogPreferences } from '../../composition/persistence/effect-bundles/preferences';
import { decodeEffectSettingsEntry } from '../../composition/persistence/effect-bundles/settings-transfer';
import { parsePaint } from '@sniptale/foundation/paint';
import type { SettingsTransferJsonValue } from '../../contracts/settings-transfer';
import { parseAnnotationTemplateTagState } from '../../composition/persistence/annotation-template-tags';
import { isUnsafeAnnotationTemplateTagState } from '../../composition/persistence/annotation-template-tags/parser';
import { resolveStoredCalloutPresetCatalog } from '../../composition/persistence/callout-presets/migration';
import { parseStoredCalloutPresetCatalog } from '../../composition/persistence/callout-presets/parser';
import {
  createDefaultDrawingPaletteState,
  parseDrawingPaletteState,
} from '../../composition/persistence/drawing-palette/parser';
import { parseStoredEditorPresetState } from '../../composition/persistence/editor-presets/guards';
import { parseGradientPresetCatalog } from '../../composition/persistence/gradient-presets/parser';
import { GRADIENT_PRESET_SURFACES } from '../../composition/persistence/gradient-presets/contracts';
import { parseStoredHighlighterSettings } from '../../composition/persistence/highlighter/guards';
import { resolveLoadedHighlighterSettings } from '../../composition/persistence/highlighter/resolved';
import { resolveStoredStepBadgePresetCatalog } from '../../composition/persistence/step-badge-presets/migration';
import { parseStoredStepBadgePresetCatalog } from '../../composition/persistence/step-badge-presets/parser';
import { parseStoredSurfaceStylePresetState } from '../../composition/persistence/surface-style-presets/parser';
import {
  SURFACE_STYLE_PRESET_SCHEMA_VERSION,
  SURFACE_STYLE_PRESET_SURFACE,
} from '../../composition/persistence/surface-style-presets/contracts';
import { parseSurfaceStyle } from '../../features/highlighter/surface-style/style';
import { failSettingsTransferDomain } from './domain-error';
import { asSettingsRecord as asRecord, cloneJsonValue as json } from './json-value';

export function parseSettingsTransferStyleDomain(
  domainId: string,
  value: Record<string, unknown>
): SettingsTransferJsonValue {
  switch (domainId) {
    case 'styles.video-effects': {
      if (value['items'] !== undefined && !Array.isArray(value['items']))
        return failSettingsTransferDomain(domainId);
      const ids = new Set<string>();
      for (const item of (value['items'] as unknown[] | undefined) ?? []) {
        const entry = decodeEffectSettingsEntry(item);
        if (ids.has(entry.packId)) return failSettingsTransferDomain(domainId);
        ids.add(entry.packId);
      }
      return json({
        ...(value['items'] === undefined ? {} : { items: value['items'] }),
        ...(value['preferences'] === undefined
          ? {}
          : { preferences: parseEffectCatalogPreferences(value['preferences']) }),
      });
    }
    case 'styles.borders': {
      const parsed = parseStoredHighlighterSettings(value);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return json(
        resolveLoadedHighlighterSettings(
          parsed.value.borderPresets,
          parsed.value.defaultBorderPresetId,
          parsed.value
        )
      );
    }
    case 'styles.callouts': {
      const parsed = parseStoredCalloutPresetCatalog(value);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return json(resolveStoredCalloutPresetCatalog(parsed.value));
    }
    case 'styles.numbering': {
      const parsed = parseStoredStepBadgePresetCatalog(value);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return json(resolveStoredStepBadgePresetCatalog(parsed.value));
    }
    case 'styles.tags': {
      if (
        (value['schemaVersion'] !== undefined && value['schemaVersion'] === null) ||
        (value['tags'] !== undefined && !Array.isArray(value['tags'])) ||
        (value['activeFilterTagIds'] !== undefined && !Array.isArray(value['activeFilterTagIds']))
      )
        failSettingsTransferDomain(domainId);
      const parsed = parseAnnotationTemplateTagState({
        schemaVersion: value['schemaVersion'] ?? 2,
        tags: value['tags'] ?? [],
        activeFilterTagIds: value['activeFilterTagIds'] ?? [],
      });
      if (isUnsafeAnnotationTemplateTagState(parsed)) failSettingsTransferDomain(domainId);
      const selectedTagIds = new Set(
        (Array.isArray(value['tags']) ? value['tags'] : [])
          .map((tag) => asRecord(tag)['id'])
          .filter((id): id is string => typeof id === 'string')
      );
      return json({
        ...(value['tags'] === undefined
          ? {}
          : { tags: parsed.value.tags.filter((tag) => selectedTagIds.has(tag.id)) }),
        ...(value['activeFilterTagIds'] === undefined
          ? {}
          : { activeFilterTagIds: parsed.value.activeFilterTagIds }),
        ...(value['schemaVersion'] === undefined
          ? {}
          : { schemaVersion: parsed.value.schemaVersion }),
      });
    }
    case 'styles.tool-presets': {
      const parsed = parseStoredEditorPresetState(value);
      if (
        parsed.hasInvalidRoot ||
        parsed.invalidFieldCount > 0 ||
        (value['palette'] !== undefined && parsed.value.palette === undefined)
      )
        failSettingsTransferDomain(domainId);
      return json(parsed.value);
    }
    case 'styles.palettes':
      return json({ slots: parsePaletteSlots(domainId, value['slots']) });
    case 'styles.gradients': {
      const parsed = parseGradientPresetCatalog(value);
      if (parsed.unsafeForWrite) {
        return json({
          ...(value['presets'] === undefined
            ? {}
            : { presets: parsePartialGradientPresets(domainId, value['presets']) }),
          ...parsePartialGradientDefaults(domainId, value),
        });
      }
      if (
        (value['favoriteIdsBySurface'] !== undefined &&
          (!hasOnlyKnownSurfaceKeys(value['favoriteIdsBySurface'], GRADIENT_PRESET_SURFACES) ||
            !hasOnlyKnownFavoriteIds(
              value['favoriteIdsBySurface'],
              new Set(parsed.catalog.presets.map((preset) => preset.id))
            ))) ||
        (value['defaultPresetIdBySurface'] !== undefined &&
          !hasOnlyKnownSurfaceKeys(value['defaultPresetIdBySurface'], GRADIENT_PRESET_SURFACES))
      )
        failSettingsTransferDomain(domainId);
      return json(parsed.catalog);
    }
    case 'styles.surfaces': {
      const parsed = parseStoredSurfaceStylePresetState(normalizeSurfaceCatalogForParsing(value));
      if (!parsed.stored || parsed.catalog.unsafeForWrite) {
        return json({
          ...(value['presets'] === undefined
            ? {}
            : { presets: parsePartialSurfacePresets(domainId, value['presets']) }),
          ...parsePartialSurfaceDefaults(domainId, value),
        });
      }
      const presetIds = new Set(parsed.catalog.presets.map((preset) => preset.id));
      if (
        (value['favoriteIds'] !== undefined &&
          !hasOnlyKnownFavoriteIds(value['favoriteIds'], presetIds)) ||
        (value['favoriteIdsBySurface'] !== undefined &&
          (!hasOnlyKnownSurfaceKeys(value['favoriteIdsBySurface'], [
            SURFACE_STYLE_PRESET_SURFACE,
          ]) ||
            !hasOnlyKnownFavoriteIds(value['favoriteIdsBySurface'], presetIds))) ||
        (value['defaultPresetIdBySurface'] !== undefined &&
          !hasOnlyKnownSurfaceKeys(value['defaultPresetIdBySurface'], [
            SURFACE_STYLE_PRESET_SURFACE,
          ]))
      )
        failSettingsTransferDomain(domainId);
      return json(parsed.catalog);
    }
  }
  return failSettingsTransferDomain(domainId);
}

export function hasOnlyKnownFavoriteIds(value: unknown, ids: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.every((id) => typeof id === 'string' && ids.has(id));
  if (!value || typeof value !== 'object') return false;
  return Object.values(asRecord(value)).every((entry) => hasOnlyKnownFavoriteIds(entry, ids));
}

function hasOnlyKnownSurfaceKeys(value: unknown, knownSurfaces: readonly string[]): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((surface) => knownSurfaces.includes(surface))
  );
}

export function normalizeSurfaceCatalogForParsing(value: Record<string, unknown>): unknown {
  if (!('defaultPresetId' in value) && !('favoriteIds' in value) && !('unsafeForWrite' in value)) {
    return value;
  }
  return {
    catalogRevision: value['catalogRevision'],
    defaultPresetIdBySurface: {
      [SURFACE_STYLE_PRESET_SURFACE]: value['defaultPresetId'],
    },
    favoriteIdsBySurface: {
      [SURFACE_STYLE_PRESET_SURFACE]: value['favoriteIds'],
    },
    presets: value['presets'],
    schemaVersion: SURFACE_STYLE_PRESET_SCHEMA_VERSION,
    systemCatalogRevision: value['systemCatalogRevision'],
  };
}

function parsePartialSurfaceDefaults(
  domainId: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set([
    'presets',
    'catalogRevision',
    'defaultPresetId',
    'defaultPresetIdBySurface',
    'favoriteIds',
    'favoriteIdsBySurface',
    'schemaVersion',
    'systemCatalogRevision',
    'unsafeForWrite',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) failSettingsTransferDomain(domainId);
  const defaults = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'presets'));
  if (
    (defaults['catalogRevision'] !== undefined &&
      (!Number.isSafeInteger(defaults['catalogRevision']) ||
        (defaults['catalogRevision'] as number) < 0)) ||
    (defaults['systemCatalogRevision'] !== undefined &&
      (!Number.isSafeInteger(defaults['systemCatalogRevision']) ||
        (defaults['systemCatalogRevision'] as number) < 0)) ||
    (defaults['defaultPresetId'] !== undefined &&
      (typeof defaults['defaultPresetId'] !== 'string' ||
        defaults['defaultPresetId'].length === 0 ||
        defaults['defaultPresetId'].length > 256)) ||
    (defaults['favoriteIds'] !== undefined && !isBoundedIdList(defaults['favoriteIds'])) ||
    (defaults['schemaVersion'] !== undefined &&
      defaults['schemaVersion'] !== SURFACE_STYLE_PRESET_SCHEMA_VERSION) ||
    (defaults['defaultPresetIdBySurface'] !== undefined &&
      !isSingleSurfaceMap(
        defaults['defaultPresetIdBySurface'],
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 256
      )) ||
    (defaults['favoriteIdsBySurface'] !== undefined &&
      !isSingleSurfaceMap(defaults['favoriteIdsBySurface'], isBoundedIdList)) ||
    (defaults['unsafeForWrite'] !== undefined && defaults['unsafeForWrite'] !== false)
  )
    failSettingsTransferDomain(domainId);
  if (defaults['defaultPresetIdBySurface'] !== undefined) {
    defaults['defaultPresetId'] = asRecord(defaults['defaultPresetIdBySurface'])[
      SURFACE_STYLE_PRESET_SURFACE
    ];
    delete defaults['defaultPresetIdBySurface'];
  }
  if (defaults['favoriteIdsBySurface'] !== undefined) {
    defaults['favoriteIds'] = asRecord(defaults['favoriteIdsBySurface'])[
      SURFACE_STYLE_PRESET_SURFACE
    ];
    delete defaults['favoriteIdsBySurface'];
  }
  return defaults;
}

function isSingleSurfaceMap(value: unknown, valid: (entry: unknown) => boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([surface, entry]) => surface === SURFACE_STYLE_PRESET_SURFACE && valid(entry)
  );
}

function parsePartialGradientDefaults(
  domainId: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set([
    'presets',
    'revision',
    'favoriteIdsBySurface',
    'defaultPresetIdBySurface',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) failSettingsTransferDomain(domainId);
  const defaults = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'presets'));
  if (
    (defaults['revision'] !== undefined &&
      (!Number.isSafeInteger(defaults['revision']) || (defaults['revision'] as number) < 0)) ||
    (defaults['favoriteIdsBySurface'] !== undefined &&
      !isSurfaceMap(defaults['favoriteIdsBySurface'], isBoundedIdList)) ||
    (defaults['defaultPresetIdBySurface'] !== undefined &&
      !isSurfaceMap(
        defaults['defaultPresetIdBySurface'],
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 256
      ))
  )
    failSettingsTransferDomain(domainId);
  return defaults;
}

function isSurfaceMap(value: unknown, valid: (entry: unknown) => boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([surface, entry]) =>
      GRADIENT_PRESET_SURFACES.some((known) => known === surface) && valid(entry)
  );
}

function isBoundedIdList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 256) &&
    new Set(value).size === value.length
  );
}

function parseManagedStylePresetIdentity(domainId: string, candidate: unknown) {
  const item = asRecord(candidate);
  if (
    typeof item['id'] !== 'string' ||
    typeof item['name'] !== 'string' ||
    (item['origin'] !== 'system' && item['origin'] !== 'user') ||
    typeof item['enabled'] !== 'boolean' ||
    typeof item['customized'] !== 'boolean' ||
    !Number.isSafeInteger(item['order'])
  )
    failSettingsTransferDomain(domainId);
  return {
    item,
    identity: {
      id: item['id'],
      name: item['name'],
      origin: item['origin'],
      enabled: item['enabled'],
      customized: item['customized'],
      order: item['order'],
    },
  };
}

function parsePartialSurfacePresets(domainId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) failSettingsTransferDomain(domainId);
  return value.map((candidate) => {
    const { identity, item } = parseManagedStylePresetIdentity(domainId, candidate);
    const style = parseSurfaceStyle(item['style']);
    if (!style) failSettingsTransferDomain(domainId);
    return {
      ...identity,
      style,
    };
  });
}

function parsePartialGradientPresets(domainId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) failSettingsTransferDomain(domainId);
  return value.map((candidate) => {
    const { identity, item } = parseManagedStylePresetIdentity(domainId, candidate);
    const paint = parsePaint({ kind: 'gradient', gradient: item['gradient'] });
    if (paint?.kind !== 'gradient') failSettingsTransferDomain(domainId);
    return {
      ...identity,
      gradient: paint.gradient,
    };
  });
}

function parsePaletteSlots(domainId: string, value: unknown): Record<string, string> {
  const slots = asRecord(value);
  if (Object.keys(slots).length === 0) failSettingsTransferDomain(domainId);
  const colors = [...createDefaultDrawingPaletteState().colors];
  for (const [slotId, color] of Object.entries(slots)) {
    const index = Number(slotId.replace('slot-', ''));
    if (
      `slot-${index}` !== slotId ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= colors.length ||
      typeof color !== 'string'
    ) {
      failSettingsTransferDomain(domainId);
    }
    colors[index] = color;
  }
  const parsed = parseDrawingPaletteState({ schemaVersion: 1, colors });
  if (parsed.unsafeForWrite) failSettingsTransferDomain(domainId);
  return Object.fromEntries(
    Object.keys(slots).map((slotId) => [slotId, parsed.state.colors[Number(slotId.slice(5))]!])
  );
}
