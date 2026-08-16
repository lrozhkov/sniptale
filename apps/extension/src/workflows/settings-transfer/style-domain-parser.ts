import { parsePaint } from '@sniptale/foundation/paint';
import type { SettingsTransferJsonValue } from '../../contracts/settings-transfer';
import { cloneSettingsTransferJsonValue } from '../../contracts/settings-transfer';
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
import { parseStoredHighlighterSettings } from '../../composition/persistence/highlighter/guards';
import { resolveLoadedHighlighterSettings } from '../../composition/persistence/highlighter/resolved';
import { resolveStoredStepBadgePresetCatalog } from '../../composition/persistence/step-badge-presets/migration';
import { parseStoredStepBadgePresetCatalog } from '../../composition/persistence/step-badge-presets/parser';
import { parseStoredSurfaceStylePresetState } from '../../composition/persistence/surface-style-presets/parser';
import { parseSurfaceStyle } from '../../features/highlighter/surface-style/style';
import { failSettingsTransferDomain } from './domain-error';

export function parseSettingsTransferStyleDomain(
  domainId: string,
  value: Record<string, unknown>
): SettingsTransferJsonValue {
  switch (domainId) {
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
      const parsed = parseAnnotationTemplateTagState(value);
      if (isUnsafeAnnotationTemplateTagState(parsed)) failSettingsTransferDomain(domainId);
      return json(parsed.value);
    }
    case 'styles.tool-presets': {
      const parsed = parseStoredEditorPresetState(value);
      if (parsed.hasInvalidRoot || parsed.invalidFieldCount > 0)
        failSettingsTransferDomain(domainId);
      return json(parsed.value);
    }
    case 'styles.palettes':
      return json({ slots: parsePaletteSlots(domainId, value['slots']) });
    case 'styles.gradients': {
      const parsed = parseGradientPresetCatalog(value);
      if (parsed.unsafeForWrite) {
        return json({ presets: parsePartialGradientPresets(domainId, value['presets']) });
      }
      return json(parsed.catalog);
    }
    case 'styles.surfaces': {
      const parsed = parseStoredSurfaceStylePresetState(value);
      if (!parsed.stored || parsed.catalog.unsafeForWrite) {
        return json({ presets: parsePartialSurfacePresets(domainId, value['presets']) });
      }
      return json(parsed.catalog);
    }
  }
  return failSettingsTransferDomain(domainId);
}

function parsePartialSurfacePresets(domainId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) failSettingsTransferDomain(domainId);
  return value.map((candidate) => {
    const item = asRecord(candidate);
    const style = parseSurfaceStyle(item['style']);
    if (
      typeof item['id'] !== 'string' ||
      typeof item['name'] !== 'string' ||
      (item['origin'] !== 'system' && item['origin'] !== 'user') ||
      typeof item['enabled'] !== 'boolean' ||
      typeof item['customized'] !== 'boolean' ||
      !Number.isSafeInteger(item['order']) ||
      !style
    )
      failSettingsTransferDomain(domainId);
    return {
      id: item['id'],
      name: item['name'],
      origin: item['origin'],
      enabled: item['enabled'],
      customized: item['customized'],
      order: item['order'],
      style,
    };
  });
}

function parsePartialGradientPresets(domainId: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) failSettingsTransferDomain(domainId);
  return value.map((candidate) => {
    const item = asRecord(candidate);
    const paint = parsePaint({ kind: 'gradient', gradient: item['gradient'] });
    if (
      typeof item['id'] !== 'string' ||
      typeof item['name'] !== 'string' ||
      (item['origin'] !== 'system' && item['origin'] !== 'user') ||
      typeof item['enabled'] !== 'boolean' ||
      typeof item['customized'] !== 'boolean' ||
      !Number.isSafeInteger(item['order']) ||
      paint?.kind !== 'gradient'
    )
      failSettingsTransferDomain(domainId);
    return {
      id: item['id'],
      name: item['name'],
      origin: item['origin'],
      enabled: item['enabled'],
      customized: item['customized'],
      order: item['order'],
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

function json(value: unknown): SettingsTransferJsonValue {
  return cloneSettingsTransferJsonValue(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
