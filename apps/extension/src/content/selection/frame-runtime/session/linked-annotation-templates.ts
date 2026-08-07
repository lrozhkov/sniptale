import type { AppliedBorderSettings } from '../../../../features/highlighter/contracts';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { getLoadedCalloutPresetCatalogSnapshot } from '../../../../composition/persistence/callout-presets';
import { loadCalloutPresetCatalog } from '../../../../composition/persistence/callout-presets';
import {
  getLoadedStepBadgePresetCatalogSnapshot,
  loadStepBadgePresetCatalog,
} from '../../../../composition/persistence/step-badge-presets';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createStepBadgeSettingsFromTemplate } from '../../../../features/highlighter/step-badge-presets/catalog';
import { getAnnotationTemplateSources } from './annotation-template-source';
import { cloneStepBadgeSettings } from './step-badge-defaults';
import type { Dispatch, SetStateAction } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'LinkedAnnotationTemplates' });
let catalogReadiness: Promise<void> | null = null;

export function ensureLinkedAnnotationTemplateCatalogsReady(): Promise<void> {
  if (getLoadedCalloutPresetCatalogSnapshot() && getLoadedStepBadgePresetCatalogSnapshot()) {
    return Promise.resolve();
  }
  catalogReadiness ??= Promise.all([loadCalloutPresetCatalog(), loadStepBadgePresetCatalog()]).then(
    () => undefined
  );
  return catalogReadiness.catch((error) => {
    catalogReadiness = null;
    throw error;
  });
}

export function reconcileLinkedAnnotationTemplatesWhenReady(args: {
  expectedCalloutSourcePresetId?: string;
  expectedStepBadgeSourcePresetId?: string;
  frameId: string;
  setFrames: Dispatch<SetStateAction<FrameData[]>>;
}): void {
  void ensureLinkedAnnotationTemplateCatalogsReady()
    .then(() => {
      args.setFrames((frames) =>
        frames.map((frame) =>
          frame.id === args.frameId ? reconcileLinkedAnnotationTemplates(frame, args) : frame
        )
      );
    })
    .catch((error) => logger.error('Failed to resolve linked annotation templates', error));
}

function reconcileLinkedAnnotationTemplates(
  frame: FrameData,
  expected: {
    expectedCalloutSourcePresetId?: string;
    expectedStepBadgeSourcePresetId?: string;
  }
): FrameData {
  let next = frame;
  if (frame.callout && frame.callout.sourcePresetId === expected.expectedCalloutSourcePresetId) {
    const resolved = resolveFrameCalloutTemplate(frame.callout, frame.borderSettings);
    if (resolved.sourcePresetId !== frame.callout.sourcePresetId) {
      next = {
        ...next,
        callout: {
          ...resolved,
          content: frame.callout.content,
          enabled: frame.callout.enabled,
          instanceId: frame.callout.instanceId,
        },
      };
    }
  }
  if (
    frame.stepBadge &&
    frame.stepBadge.sourcePresetId === expected.expectedStepBadgeSourcePresetId
  ) {
    const resolved = resolveFrameStepBadgeTemplate(frame.stepBadge, frame.borderSettings);
    if (resolved.sourcePresetId !== frame.stepBadge.sourcePresetId) {
      next = {
        ...next,
        stepBadge: {
          ...resolved,
          enabled: frame.stepBadge.enabled,
          value: frame.stepBadge.value,
          ...(frame.stepBadge.auto === undefined ? {} : { auto: frame.stepBadge.auto }),
          ...(frame.stepBadge.manualPlacement === undefined
            ? {}
            : { manualPlacement: frame.stepBadge.manualPlacement }),
          ...(frame.stepBadge.offsetDirections === undefined
            ? {}
            : { offsetDirections: frame.stepBadge.offsetDirections }),
        },
      };
    }
  }
  return next;
}

export function resolveFrameCalloutTemplate(
  fallback: CalloutSettings,
  borderSettings: AppliedBorderSettings | undefined
): CalloutSettings {
  if (getAnnotationTemplateSources().callout === 'forced') {
    return structuredClone(fallback);
  }
  const presetId = cloneBorderPresetEffects(borderSettings?.effects).linkedTemplates
    ?.calloutPresetId;
  const preset = getLoadedCalloutPresetCatalogSnapshot()?.presets.find(
    (candidate) => candidate.id === presetId
  );
  return preset
    ? createDefaultCalloutSettings(preset.style, preset.id, preset.placement, preset.content)
    : structuredClone(fallback);
}

export function resolveFrameStepBadgeTemplate(
  fallback: StepBadgeSettings,
  borderSettings: AppliedBorderSettings | undefined
): StepBadgeSettings {
  if (getAnnotationTemplateSources().stepBadge === 'forced') {
    return cloneStepBadgeSettings(fallback);
  }
  const presetId = cloneBorderPresetEffects(borderSettings?.effects).linkedTemplates
    ?.stepBadgePresetId;
  const preset = getLoadedStepBadgePresetCatalogSnapshot()?.presets.find(
    (candidate) => candidate.id === presetId
  );
  return preset
    ? createStepBadgeSettingsFromTemplate(preset.settings, preset.id)
    : cloneStepBadgeSettings(fallback);
}
