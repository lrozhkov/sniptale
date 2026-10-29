// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type {
  AppliedBorderSettings,
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import { createFrameDataFixture } from '../react/test-support';
import {
  buildFrameForAdd,
  buildFreeFrameForAdd,
  buildStandaloneAnnotationForAdd,
} from './frame-build';
import { createDefaultFrameCallout } from '../../../../features/highlighter/frame-annotation/defaults';
import { setFutureFrameCallout, resetFutureFrameCallout } from '../session/future-callout';
import { setFrameSessionBorderPreset } from '../session/border-preset';

function createBlurSettings(): BlurSettings {
  return {
    amount: 12,
    blurType: 'gaussian',
    showBorder: true,
  };
}

function createFocusSettings(): FocusSettings {
  return {
    opacity: 0.45,
    showBorder: false,
  };
}

function createHighlighterSettings(): HighlighterSettings {
  return {
    borderPresets: [
      {
        id: 'preset-1',
        name: 'Orange',
        order: 0,
        tagIds: [],
        width: 3,
        color: '#ff671d',
        style: 'solid',
        radius: 8,
        padding: {
          top: 4,
          right: 5,
          bottom: 6,
          left: 7,
        },
        shadow: 30,
        customCss: '',
        fillPaint: { kind: 'solid' as const, color: '#00000000' },
        inheritCustomCss: false,
      },
    ],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    systemPresetCatalogRevision: 1,
    defaultBlurSettings: createBlurSettings(),
    defaultFocusSettings: createFocusSettings(),
  };
}

function createStepBadgeTemplate(auto = true): StepBadgeSettings {
  return {
    enabled: true,
    anchor: 'top-left',
    type: 'number',
    value: '4',
    auto,
    sizeLevel: 2,
    offsetDirections: [],
  };
}

function createBuildArgs() {
  setFrameSessionBorderPreset(createHighlighterSettings().borderPresets[0]!);
  const element = document.createElement('button');
  document.body.append(element);
  const borderSettings: AppliedBorderSettings = {
    sourcePresetId: 'coords-border',
    sourcePresetName: 'Coords',
    width: 2,
    color: '#123456',
    style: 'solid',
    radius: 4,
    padding: {
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    },
    shadow: 0,
    customCss: '',
    fillPaint: { kind: 'solid' as const, color: '#00000000' },
    inheritCustomCss: false,
  };

  return {
    calculateFrameCoords: (_element: HTMLElement, nextBorder?: AppliedBorderSettings) =>
      createFrameDataFixture('frame-1', {
        borderSettings: nextBorder ?? borderSettings,
        width: 100,
      }),
    element,
    globalEffectModeRef: { current: 'border' as const },
    globalStepBadgeAutoModeRef: { current: true },
    sessionBlurSettingsRef: { current: createBlurSettings() },
    sessionFocusSettingsRef: { current: createFocusSettings() },
    sessionStepBadgeTemplateRef: { current: createStepBadgeTemplate() as StepBadgeSettings | null },
  };
}

function expectBuildFrameUsesSessionDefaultsAndAutoBadgeMode() {
  const frame = buildFrameForAdd(createBuildArgs());

  expect(frame).toMatchObject({
    id: 'frame-1',
    effectMode: 'border',
    blurSettings: createBlurSettings(),
    focusSettings: createFocusSettings(),
    borderSettings: expect.objectContaining({
      sourcePresetId: 'preset-1',
      sourcePresetName: 'Orange',
    }),
    stepBadge: expect.objectContaining({
      enabled: true,
      auto: true,
      value: '',
    }),
    linkedElementSelector: expect.any(String),
  });
}

function expectBuildFramePreservesManualBadgeValue() {
  const args = createBuildArgs();
  args.globalStepBadgeAutoModeRef.current = false;
  args.sessionStepBadgeTemplateRef.current = createStepBadgeTemplate(false);

  const frame = buildFrameForAdd(args);

  expect(frame.stepBadge).toMatchObject({
    auto: false,
    value: '4',
  });
}

function expectBuildFrameOmitsDisabledBadge() {
  const args = createBuildArgs();
  args.sessionStepBadgeTemplateRef.current = createStepBadgeTemplate();
  args.sessionStepBadgeTemplateRef.current.enabled = false;

  const linkedFrame = buildFrameForAdd(args);
  const freeFrame = buildFreeFrameForAdd({
    globalEffectModeRef: args.globalEffectModeRef,
    globalStepBadgeAutoModeRef: args.globalStepBadgeAutoModeRef,
    sessionBlurSettingsRef: args.sessionBlurSettingsRef,
    sessionFocusSettingsRef: args.sessionFocusSettingsRef,
    sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
    generateFrameId: () => 'free-frame',
    input: {
      x: 30,
      y: 40,
      width: 150,
      height: 90,
      pagePlacement: { iframePath: [], pageX: 130, pageY: 240 },
    },
  });

  expect(linkedFrame.stepBadge).toBeUndefined();
  expect(freeFrame.stepBadge).toBeUndefined();
}

describe('frame-mutation-actions-frame-build', () => {
  it(
    'builds a frame with session defaults, selected border preset, and auto badge clearing',
    expectBuildFrameUsesSessionDefaultsAndAutoBadgeMode
  );
  it(
    'preserves the template badge value in manual mode',
    expectBuildFramePreservesManualBadgeValue
  );
  it('omits numbering when it is disabled in the main toolbar', expectBuildFrameOmitsDisabledBadge);
  it('builds a free frame with session defaults and no DOM anchor', () => {
    const args = createBuildArgs();
    const frame = buildFreeFrameForAdd({
      globalEffectModeRef: args.globalEffectModeRef,
      globalStepBadgeAutoModeRef: args.globalStepBadgeAutoModeRef,
      sessionBlurSettingsRef: args.sessionBlurSettingsRef,
      sessionFocusSettingsRef: args.sessionFocusSettingsRef,
      sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
      generateFrameId: () => 'free-frame',
      input: {
        x: 30,
        y: 40,
        width: 150,
        height: 90,
        pagePlacement: { iframePath: [], pageX: 130, pageY: 240 },
      },
    });

    expect(frame).toMatchObject({
      id: 'free-frame',
      x: 30,
      y: 40,
      width: 150,
      height: 90,
      pagePlacement: { iframePath: [], pageX: 130, pageY: 240 },
      effectMode: 'border',
      borderSettings: { sourcePresetId: 'preset-1' },
    });
    expect(frame.linkedElementSelector).toBeUndefined();
    expect(frame.offset).toBeUndefined();
  });
});

describe('standalone annotation construction', () => {
  it.each(['callout', 'step-badge'] as const)(
    'builds a %s with its own settings and no frame effects',
    (annotationKind) => {
      const args = createBuildArgs();
      const callout = createDefaultFrameCallout();
      setFutureFrameCallout(callout);
      try {
        const frame = buildStandaloneAnnotationForAdd({
          ...args,
          annotationKind,
          generateFrameId: () => 'standalone-1',
          input: {
            x: 30,
            y: 40,
            width: 1,
            height: 1,
            pagePlacement: { iframePath: [], pageX: 130, pageY: 240 },
          },
        });
        expect(frame).toMatchObject({
          id: 'standalone-1',
          annotationKind,
          x: 30,
          y: 40,
          pagePlacement: { iframePath: [], pageX: 130, pageY: 240 },
        });
        expect(frame.borderSettings).toBeUndefined();
        expect(frame.blurSettings).toBeUndefined();
        expect(frame.focusSettings).toBeUndefined();
        expect(frame.effectMode).toBeUndefined();
        if (annotationKind === 'callout') {
          expect(frame.stepBadge).toBeUndefined();
          expect(frame.callout).toMatchObject({
            enabled: true,
            style: {
              colorBindings: {
                accent: 'custom',
                connector: 'custom',
                surfaceBackground: 'custom',
                surfaceBorder: 'custom',
              },
            },
          });
          expect(frame.callout).not.toBe(callout);
          expect(callout).toEqual(createDefaultFrameCallout());
        } else {
          expect(frame.callout).toBeUndefined();
          expect(frame.stepBadge).toMatchObject({
            enabled: true,
            auto: true,
            value: '',
            style: {
              sizeSource: 'custom',
              backgroundColorSource: 'custom',
              textColorSource: 'custom',
            },
          });
          expect(args.sessionStepBadgeTemplateRef.current?.value).toBe('4');
        }
      } finally {
        resetFutureFrameCallout();
      }
    }
  );

  it('keeps a standalone manual badge value out of the automatic sequence', () => {
    const args = createBuildArgs();
    args.sessionStepBadgeTemplateRef.current = createStepBadgeTemplate(false);
    const frame = buildStandaloneAnnotationForAdd({
      ...args,
      annotationKind: 'step-badge',
      generateFrameId: () => 'manual',
      input: {
        x: 20,
        y: 30,
        width: 1,
        height: 1,
        pagePlacement: { iframePath: [], pageX: 20, pageY: 30 },
      },
    });
    expect(frame.stepBadge).toMatchObject({ enabled: true, auto: false, value: '4' });
  });
});

it('places standalone badges at the chosen point without inherited frame-boundary offsets', () => {
  const args = createBuildArgs();
  args.sessionStepBadgeTemplateRef.current = {
    ...createStepBadgeTemplate(false),
    anchor: 'bottom-right',
    offsetDirections: ['right', 'down'],
    manualPlacement: { side: 'right', position: 0.8, normalOffset: 50, tangentialOffset: 30 },
  };
  const frame = buildStandaloneAnnotationForAdd({
    ...args,
    annotationKind: 'step-badge',
    generateFrameId: () => 'point',
    input: {
      x: 20,
      y: 30,
      width: 1,
      height: 1,
      pagePlacement: { iframePath: [], pageX: 20, pageY: 30 },
    },
  });
  expect(frame.stepBadge?.manualPlacement).toBeUndefined();
  expect(frame.stepBadge?.offsetDirections).toEqual([]);
  expect(frame.stepBadge?.anchor).toBe('center');
  expect(args.sessionStepBadgeTemplateRef.current.manualPlacement?.normalOffset).toBe(50);
});
