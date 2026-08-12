import type { MutableRefObject } from 'react';
import type {
  StepBadgePresetCatalog,
  StepBadgeSettings,
  StepBadgeTemplateSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getLoadedStepBadgePresetCatalogSnapshot,
  loadStepBadgePresetCatalog,
  subscribeToStepBadgePresetCatalog,
} from '../../../../composition/persistence/step-badge-presets';
import {
  DEFAULT_STEP_BADGE_TEMPLATE,
  cloneStepBadgeTemplate,
  createStepBadgeSettingsFromTemplate,
} from '../../../../features/highlighter/step-badge-presets/catalog';
import { DEFAULT_ANNOTATION_SESSION_DEFAULTS } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { initializeAnnotationTemplateSource } from './annotation-template-source';

const logger = createLogger({ namespace: 'ContentStepBadgeDefaults' });

function getDefaultPreset(catalog: StepBadgePresetCatalog) {
  return (
    catalog.presets.find(
      (preset) => preset.id === catalog.defaultPresetId && preset.enabled !== false
    ) ?? catalog.presets.find((preset) => preset.enabled !== false)
  );
}

function templateKey(settings: StepBadgeTemplateSettings): string {
  return JSON.stringify(settings);
}

function settingsTemplate(settings: StepBadgeSettings): StepBadgeTemplateSettings {
  return {
    anchor: settings.anchor ?? settings.corner ?? 'top-left',
    offsetDirections: [...(settings.offsetDirections ?? [])],
    type: settings.type,
    alphabet: settings.alphabet ?? 'cyrillic',
    value: settings.value,
    auto: settings.auto !== false,
    style: { ...(settings.style ?? DEFAULT_STEP_BADGE_TEMPLATE.style) },
  };
}

export function createStepBadgePresetSessionSync(
  sessionTemplateRef: MutableRefObject<StepBadgeSettings | null>
) {
  let active = true;
  let generation = 0;
  let lastDefaultKey: string | null = null;
  let sessionDefaultsApplied = false;

  const applyCatalog = (catalog: StepBadgePresetCatalog, applySessionDefaults = true) => {
    if (!active) return;
    const preset = getDefaultPreset(catalog);
    if (!preset) return;
    const current = sessionTemplateRef.current;
    const canReplace =
      current === null ||
      (lastDefaultKey !== null && templateKey(settingsTemplate(current)) === lastDefaultKey);
    if (canReplace) {
      const next = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
      const defaults = catalog.newSessionDefaults ?? DEFAULT_ANNOTATION_SESSION_DEFAULTS;
      next.enabled =
        applySessionDefaults && !sessionDefaultsApplied
          ? current?.enabled === true || defaults.enabled
          : (current?.enabled ?? false);
      sessionTemplateRef.current = next;
    }
    lastDefaultKey = templateKey(preset.settings);
    if (applySessionDefaults && !sessionDefaultsApplied) {
      sessionDefaultsApplied = true;
      const defaults = catalog.newSessionDefaults ?? DEFAULT_ANNOTATION_SESSION_DEFAULTS;
      initializeAnnotationTemplateSource('stepBadge', defaults.templateSource);
    }
  };

  const snapshot = getLoadedStepBadgePresetCatalogSnapshot();
  if (snapshot) applyCatalog(snapshot, false);

  const loadGeneration = ++generation;
  void loadStepBadgePresetCatalog()
    .then((catalog) => {
      if (loadGeneration === generation) applyCatalog(catalog);
    })
    .catch((error) => {
      if (active) logger.error('Failed to load step badge preset catalog', error);
    });
  const unsubscribe = subscribeToStepBadgePresetCatalog((catalog) => {
    generation += 1;
    applyCatalog(catalog);
  });

  return () => {
    active = false;
    generation += 1;
    unsubscribe();
  };
}

export function createSessionStepBadgeSettings(): StepBadgeSettings {
  const catalog = getLoadedStepBadgePresetCatalogSnapshot();
  const preset = catalog ? getDefaultPreset(catalog) : undefined;
  return preset
    ? createStepBadgeSettingsFromTemplate(preset.settings, preset.id)
    : createStepBadgeSettingsFromTemplate(cloneStepBadgeTemplate(DEFAULT_STEP_BADGE_TEMPLATE));
}

export function cloneStepBadgeSettings(settings: StepBadgeSettings): StepBadgeSettings {
  return {
    ...settings,
    offsetDirections: [...(settings.offsetDirections ?? [])],
    ...(settings.manualPlacement ? { manualPlacement: { ...settings.manualPlacement } } : {}),
    ...(settings.style ? { style: { ...settings.style } } : {}),
  };
}

export function createStepBadgeTemplateSnapshot(settings: StepBadgeSettings): StepBadgeSettings {
  const clone = cloneStepBadgeSettings(settings);
  delete clone.manualPlacement;
  return clone;
}
