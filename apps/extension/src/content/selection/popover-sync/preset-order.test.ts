// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { prioritizeActivePreset, useOpeningPresetOrder } from './preset-order';

const presets = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];

afterEach(() => document.body.replaceChildren());

describe('prioritizeActivePreset', () => {
  it('moves the opening active preset to the front without mutating the catalog', () => {
    expect(prioritizeActivePreset(presets, 'three').map((preset) => preset.id)).toEqual([
      'three',
      'one',
      'two',
    ]);
    expect(presets.map((preset) => preset.id)).toEqual(['one', 'two', 'three']);
  });

  it('keeps the opening order stable until the list is remounted', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let orderedIds: string[] = [];
    function Harness(props: { activePresetId: string }) {
      orderedIds = useOpeningPresetOrder(presets, props.activePresetId).map((preset) => preset.id);
      return null;
    }

    act(() => root.render(createElement(Harness, { activePresetId: 'two' })));
    expect(orderedIds).toEqual(['two', 'one', 'three']);
    act(() => root.render(createElement(Harness, { activePresetId: 'three' })));
    expect(orderedIds).toEqual(['two', 'one', 'three']);
    act(() => root.unmount());

    const reopenedRoot = createRoot(host);
    act(() => reopenedRoot.render(createElement(Harness, { activePresetId: 'three' })));
    expect(orderedIds).toEqual(['three', 'one', 'two']);
    act(() => reopenedRoot.unmount());
  });

  it('keeps catalog order when there is no matching active preset', () => {
    expect(prioritizeActivePreset(presets, undefined)).toEqual(presets);
    expect(prioritizeActivePreset(presets, 'missing')).toEqual(presets);
  });
});
