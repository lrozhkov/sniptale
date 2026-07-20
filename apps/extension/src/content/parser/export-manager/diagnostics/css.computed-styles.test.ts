// @vitest-environment jsdom

import { afterEach, it, vi } from 'vitest';

import {
  expectCappedTargetAsset,
  expectVisibleTargetAsset,
  installCappedTargetFixture,
  installVisibleTargetFixture,
  readComputedStyleAsset,
} from './css.computed-styles.test.helpers';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it('serializes visible targets with stable paths and filters extension-owned nodes', () => {
  installVisibleTargetFixture();
  const asset = readComputedStyleAsset();

  expectVisibleTargetAsset(asset);
});

it('caps collected targets and normalizes non-finite geometry values', () => {
  installCappedTargetFixture();

  const asset = readComputedStyleAsset();
  expectCappedTargetAsset(asset);
});
