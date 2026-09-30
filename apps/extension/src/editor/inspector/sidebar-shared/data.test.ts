import { expect, it } from 'vitest';

import { GRID_COLOR_PALETTE, WORKSPACE_BACKGROUND_PALETTE } from './data';
import { getFrameGradientPresets } from './options';
import { getShowcaseGradient } from '../../../features/highlighter/showcase-resources';
import { createDefaultGradientPresetCatalog } from '../../../composition/persistence/gradient-presets/defaults';

it('exposes stable palette and gradient preset data', () => {
  expect(WORKSPACE_BACKGROUND_PALETTE).toHaveLength(10);
  expect(WORKSPACE_BACKGROUND_PALETTE[0]).toBe('#f2f4f7');
  expect(GRID_COLOR_PALETTE).toHaveLength(14);
  expect(GRID_COLOR_PALETTE).not.toEqual(
    expect.arrayContaining(['#2563eb', '#0f766e', '#ca8a04', '#f97316'])
  );
  const presets = getFrameGradientPresets();
  expect(presets).toHaveLength(10);
  expect(presets[0]).toMatchObject({
    angle: 135,
    from: '#f97316ff',
    id: 'system-sunset',
    to: '#ec4899ff',
  });
  expect(
    presets.every(
      (preset) =>
        getShowcaseGradient(preset.id as Parameters<typeof getShowcaseGradient>[0]).type ===
        'linear'
    )
  ).toBe(true);
  const videoPresets = createDefaultGradientPresetCatalog().presets.slice(0, 10);
  expect(presets.map((preset) => preset.id)).toEqual(videoPresets.map((preset) => preset.id));
  expect(presets.map((preset) => preset.stops)).toEqual(
    videoPresets.map((preset) =>
      preset.gradient.stops.map((stop) => ({ color: stop.color, offset: stop.position }))
    )
  );
});
