// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createBlurSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
} from '../test-support';
import {
  areBlurFrameDescriptorsEqual,
  areFocusFrameDescriptorsEqual,
  buildBlurFrameDescriptors,
  buildFocusFrameDescriptors,
} from './overlay-descriptors';

function createFrame(id: string, effectMode: 'focus' | 'blur' | 'border') {
  return createFrameDataFixture(id, {
    effectMode,
    ...(effectMode === 'focus' ? { focusSettings: createFocusSettingsFixture() } : {}),
    ...(effectMode === 'blur' ? { blurSettings: createBlurSettingsFixture() } : {}),
    height: 120,
    width: 240,
  });
}

describe('frame-effect-overlays-descriptors', () => {
  it(
    'builds focus and blur descriptors only for matching effect-mode owners',
    expectDescriptorProjection
  );

  it('compares descriptor arrays by shape and ordered field values', () => {
    const focusDescriptors = buildFocusFrameDescriptors([createFrame('focus-1', 'focus')]);
    const equalFocusDescriptors = buildFocusFrameDescriptors([createFrame('focus-1', 'focus')]);
    const changedFocusDescriptors = buildFocusFrameDescriptors([
      { ...createFrame('focus-1', 'focus'), focusSettings: { opacity: 0.8, showBorder: false } },
    ]);
    const blurDescriptors = buildBlurFrameDescriptors([createFrame('blur-1', 'blur')]);
    const changedBlurDescriptors = buildBlurFrameDescriptors([
      {
        ...createFrame('blur-1', 'blur'),
        blurSettings: { amount: 20, blurType: 'gaussian', showBorder: true },
      },
    ]);

    expect(areFocusFrameDescriptorsEqual(focusDescriptors, equalFocusDescriptors)).toBe(true);
    expect(areFocusFrameDescriptorsEqual(focusDescriptors, changedFocusDescriptors)).toBe(false);
    expect(areBlurFrameDescriptorsEqual(blurDescriptors, changedBlurDescriptors)).toBe(false);
    expect(areBlurFrameDescriptorsEqual(blurDescriptors, [])).toBe(false);
  });
});

function expectDescriptorProjection() {
  const frames = [
    createFrame('focus-1', 'focus'),
    createFrame('blur-1', 'blur'),
    createFrame('border-1', 'border'),
  ];

  expect(buildFocusFrameDescriptors(frames)).toEqual([
    {
      height: 120,
      id: 'focus-1',
      opacity: 0.4,
      width: 240,
      x: 10,
      y: 20,
    },
  ]);
  expect(buildBlurFrameDescriptors(frames)).toEqual([
    {
      amount: 12,
      blurType: 'gaussian',
      borderRadius: 6,
      borderWidth: 2,
      height: 120,
      id: 'blur-1',
      showBlurBorder: true,
      width: 240,
      x: 10,
      y: 20,
    },
  ]);
}
