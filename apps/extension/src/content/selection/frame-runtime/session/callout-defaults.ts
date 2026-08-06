import type { MutableRefObject } from 'react';
import type {
  CalloutPresetCatalog,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getLoadedCalloutPresetCatalogSnapshot,
  loadCalloutPresetCatalog,
  subscribeToCalloutPresetCatalog,
} from '../../../../composition/persistence/callout-presets';
import { cloneCalloutStyle, createDefaultCalloutSettings } from '../../callout/model';

const logger = createLogger({ namespace: 'ContentCalloutDefaults' });

function getDefaultPreset(catalog: CalloutPresetCatalog) {
  return (
    catalog.presets.find(
      (preset) => preset.id === catalog.defaultPresetId && preset.enabled !== false
    ) ?? catalog.presets.find((preset) => preset.enabled !== false)
  );
}

function styleKey(style: CalloutVisualStyle): string {
  return JSON.stringify(style);
}

export function createCalloutPresetSessionSync(
  sessionCalloutStyleRef: MutableRefObject<CalloutVisualStyle | null>
) {
  let lastDefaultStyleKey: string | null = null;
  let active = true;
  let catalogGeneration = 0;

  const applyCatalog = (catalog: CalloutPresetCatalog) => {
    if (!active) return;
    const preset = getDefaultPreset(catalog);
    if (!preset) return;
    const canReplace =
      sessionCalloutStyleRef.current === null ||
      (lastDefaultStyleKey !== null &&
        styleKey(sessionCalloutStyleRef.current) === lastDefaultStyleKey);
    if (canReplace) sessionCalloutStyleRef.current = cloneCalloutStyle(preset.style);
    lastDefaultStyleKey = styleKey(preset.style);
  };

  const loadGeneration = catalogGeneration + 1;
  catalogGeneration = loadGeneration;
  void loadCalloutPresetCatalog()
    .then((catalog) => {
      if (loadGeneration === catalogGeneration) applyCatalog(catalog);
    })
    .catch((error) => {
      if (active) logger.error('Failed to load callout preset catalog', error);
    });
  const unsubscribe = subscribeToCalloutPresetCatalog((catalog) => {
    catalogGeneration += 1;
    applyCatalog(catalog);
  });
  return () => {
    active = false;
    catalogGeneration += 1;
    unsubscribe();
  };
}

export function createSessionCalloutSettings(style: CalloutVisualStyle | null) {
  const catalog = getLoadedCalloutPresetCatalogSnapshot();
  const preset = catalog ? getDefaultPreset(catalog) : undefined;
  const resolvedStyle = style ?? preset?.style;
  const sourcePresetId =
    preset && resolvedStyle && styleKey(preset.style) === styleKey(resolvedStyle)
      ? preset.id
      : undefined;
  return createDefaultCalloutSettings(
    resolvedStyle,
    sourcePresetId,
    sourcePresetId ? preset?.placement : undefined,
    sourcePresetId ? preset?.content : undefined
  );
}

export { createDefaultCalloutSettings } from '../../callout/model';
