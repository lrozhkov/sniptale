// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type {
  BorderPreset,
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import type { StepBadgeSettings } from '../../../../features/highlighter/contracts';
import { createFrameDataFixture } from '../react/test-support';
import { buildFrameForAdd, buildFreeFrameForAdd } from './frame-build';
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
        opacity: 90,
        customCss: '',
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        strokeOpacity: 100,
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
  const borderSettings: BorderPreset = {
    id: 'coords-border',
    name: 'Coords',
    order: 1,
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
    opacity: 100,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
  };

  return {
    calculateFrameCoords: (_element: HTMLElement, nextBorder?: BorderPreset) =>
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
      id: 'preset-1',
      name: 'Orange',
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

describe('frame-mutation-actions-frame-build', () => {
  it(
    'builds a frame with session defaults, selected border preset, and auto badge clearing',
    expectBuildFrameUsesSessionDefaultsAndAutoBadgeMode
  );
  it(
    'preserves the template badge value in manual mode',
    expectBuildFramePreservesManualBadgeValue
  );
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
      borderSettings: { id: 'preset-1' },
    });
    expect(frame.linkedElementSelector).toBeUndefined();
    expect(frame.offset).toBeUndefined();
  });
});
