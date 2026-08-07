import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import {
  DEFAULT_STEP_BADGE_TEMPLATE,
  cloneStepBadgeTemplate,
  createStepBadgeSettingsFromTemplate,
} from '../step-badge-presets/catalog';
import { getCanonicalSystemCalloutPreset } from '../callout-presets/catalog';

export function createDefaultFrameStepBadge() {
  return {
    ...createStepBadgeSettingsFromTemplate(cloneStepBadgeTemplate(DEFAULT_STEP_BADGE_TEMPLATE)),
    enabled: true,
  };
}

export function createDefaultFrameCallout(): CalloutSettings {
  const preset = getCanonicalSystemCalloutPreset('system-callout-bubble');
  return {
    enabled: true,
    content: { bodyHtml: '', titleText: '' },
    placement: structuredClone(preset.placement),
    sourcePresetId: preset.id,
    style: structuredClone(preset.style),
  };
}
