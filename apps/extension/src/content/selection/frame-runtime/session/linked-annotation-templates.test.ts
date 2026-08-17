import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { FrameData } from '../../../../features/highlighter/contracts';
import type { Dispatch, SetStateAction } from 'react';

const snapshots = vi.hoisted(() => ({
  callouts: null as CalloutPresetCatalog | null,
  stepBadges: null as StepBadgePresetCatalog | null,
}));
const loads = vi.hoisted(() => ({
  callouts: vi.fn(),
  stepBadges: vi.fn(),
}));

vi.mock('../../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/callout-presets')>()),
  getLoadedCalloutPresetCatalogSnapshot: () => snapshots.callouts,
  loadCalloutPresetCatalog: loads.callouts,
  subscribeToCalloutPresetCatalog: () => () => undefined,
}));
vi.mock('../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/step-badge-presets')
  >()),
  getLoadedStepBadgePresetCatalogSnapshot: () => snapshots.stepBadges,
  loadStepBadgePresetCatalog: loads.stepBadges,
  subscribeToStepBadgePresetCatalog: () => () => undefined,
}));

import { createSystemCalloutPresetCatalog } from '../../../../features/highlighter/callout-presets/catalog';
import { createSystemStepBadgePresetCatalog } from '../../../../features/highlighter/step-badge-presets/catalog';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createSessionStepBadgeSettings } from './step-badge-defaults';
import {
  resetAnnotationTemplateSources,
  setAnnotationTemplateSource,
} from './annotation-template-source';
import {
  reconcileLinkedAnnotationTemplatesWhenReady,
  resolveFrameCalloutTemplate,
  resolveFrameStepBadgeTemplate,
} from './linked-annotation-templates';

beforeEach(() => {
  const callouts = createSystemCalloutPresetCatalog();
  const stepBadges = createSystemStepBadgePresetCatalog();
  snapshots.callouts = {
    catalogCustomized: false,
    defaultPresetId: callouts[0]!.id,
    presets: callouts,
    systemCatalogRevision: 1,
  };
  snapshots.stepBadges = {
    catalogCustomized: false,
    defaultPresetId: stepBadges[0]!.id,
    presets: stepBadges,
    systemCatalogRevision: 1,
  };
  loads.callouts.mockReset().mockImplementation(() => Promise.resolve(snapshots.callouts!));
  loads.stepBadges.mockReset().mockImplementation(() => Promise.resolve(snapshots.stepBadges!));
  resetAnnotationTemplateSources();
});

it('reconciles linked templates after a delayed cold-session catalog load', async () => {
  const calloutCatalog = snapshots.callouts!;
  const stepBadgeCatalog = snapshots.stepBadges!;
  const borderSettings = linkedBorderSettings();
  const calloutFallback = createDefaultCalloutSettings(
    calloutCatalog.presets[0]!.style,
    calloutCatalog.presets[0]!.id
  );
  const stepBadgeFallback = createSessionStepBadgeSettings();
  let resolveCallouts!: (catalog: CalloutPresetCatalog) => void;
  let resolveStepBadges!: (catalog: StepBadgePresetCatalog) => void;
  loads.callouts.mockImplementationOnce(
    () => new Promise((resolve) => (resolveCallouts = resolve))
  );
  loads.stepBadges.mockImplementationOnce(
    () => new Promise((resolve) => (resolveStepBadges = resolve))
  );
  snapshots.callouts = null;
  snapshots.stepBadges = null;
  let frames: FrameData[] = [
    {
      id: 'frame-cold',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      borderSettings,
      callout: calloutFallback,
      stepBadge: stepBadgeFallback,
    },
  ];
  const setFrames: Dispatch<SetStateAction<FrameData[]>> = (update) => {
    frames = typeof update === 'function' ? update(frames) : update;
  };

  reconcileLinkedAnnotationTemplatesWhenReady({
    ...(calloutFallback.sourcePresetId
      ? { expectedCalloutSourcePresetId: calloutFallback.sourcePresetId }
      : {}),
    ...(stepBadgeFallback.sourcePresetId
      ? { expectedStepBadgeSourcePresetId: stepBadgeFallback.sourcePresetId }
      : {}),
    frameId: 'frame-cold',
    setFrames,
  });
  expect(frames[0]!.callout?.sourcePresetId).toBe(calloutFallback.sourcePresetId);

  snapshots.callouts = calloutCatalog;
  snapshots.stepBadges = stepBadgeCatalog;
  resolveCallouts(calloutCatalog);
  resolveStepBadges(stepBadgeCatalog);
  await vi.waitFor(() => {
    expect(frames[0]!.callout?.sourcePresetId).toBe(calloutCatalog.presets[1]!.id);
    expect(frames[0]!.stepBadge?.sourcePresetId).toBe(stepBadgeCatalog.presets[2]!.id);
  });
});

afterEach(resetAnnotationTemplateSources);

function linkedBorderSettings() {
  return {
    ...DEFAULT_BORDER_PRESET,
    effects: {
      ...DEFAULT_BORDER_PRESET.effects!,
      linkedTemplates: {
        calloutPresetId: snapshots.callouts!.presets[1]!.id,
        stepBadgePresetId: snapshots.stepBadges!.presets[2]!.id,
      },
    },
  };
}

it('uses templates linked to the frame while preserving toolbar templates as fallback', () => {
  const calloutFallback = createDefaultCalloutSettings(
    snapshots.callouts!.presets[0]!.style,
    snapshots.callouts!.presets[0]!.id
  );
  const stepBadgeFallback = createSessionStepBadgeSettings();

  expect(resolveFrameCalloutTemplate(calloutFallback, linkedBorderSettings()).sourcePresetId).toBe(
    snapshots.callouts!.presets[1]!.id
  );
  expect(
    resolveFrameStepBadgeTemplate(stepBadgeFallback, linkedBorderSettings()).sourcePresetId
  ).toBe(snapshots.stepBadges!.presets[2]!.id);

  const missingLinks = {
    ...linkedBorderSettings(),
    effects: {
      ...linkedBorderSettings().effects,
      linkedTemplates: {
        calloutPresetId: 'missing-callout',
        stepBadgePresetId: 'missing-step-badge',
      },
    },
  };
  expect(resolveFrameCalloutTemplate(calloutFallback, missingLinks).sourcePresetId).toBe(
    calloutFallback.sourcePresetId
  );
  expect(resolveFrameStepBadgeTemplate(stepBadgeFallback, missingLinks).sourcePresetId).toBe(
    stepBadgeFallback.sourcePresetId
  );
});

it('preserves the toolbar numbering state when resolving a linked frame template', () => {
  const stepBadgeFallback = createSessionStepBadgeSettings();
  stepBadgeFallback.enabled = false;

  expect(resolveFrameStepBadgeTemplate(stepBadgeFallback, linkedBorderSettings())).toMatchObject({
    enabled: false,
    sourcePresetId: snapshots.stepBadges!.presets[2]!.id,
  });
});

it('lets an explicit toolbar selection override both linked frame templates', () => {
  setAnnotationTemplateSource('callout', 'forced');
  setAnnotationTemplateSource('stepBadge', 'forced');
  const calloutFallback = createDefaultCalloutSettings(
    snapshots.callouts!.presets[0]!.style,
    snapshots.callouts!.presets[0]!.id
  );
  const stepBadgeFallback = createSessionStepBadgeSettings();

  expect(resolveFrameCalloutTemplate(calloutFallback, linkedBorderSettings()).sourcePresetId).toBe(
    calloutFallback.sourcePresetId
  );
  expect(
    resolveFrameStepBadgeTemplate(stepBadgeFallback, linkedBorderSettings()).sourcePresetId
  ).toBe(stepBadgeFallback.sourcePresetId);
});
