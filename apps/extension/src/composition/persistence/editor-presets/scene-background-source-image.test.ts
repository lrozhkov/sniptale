import { expect, it } from 'vitest';
import { createDefaultEditorPresetStorageState } from './defaults';
import { parseSceneBackgroundSettings } from './setting-parsers';

it('falls back scene source image and omitted optional scene fields to defaults', () => {
  const defaults = createDefaultEditorPresetStorageState().sceneBackground.presets[0]!.settings;

  expect(
    parseSceneBackgroundSettings({
      backgroundColor: '#ffffff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#000000',
      backgroundGradientTo: '#ffffff',
      backgroundMode: 'color',
    })
  ).toEqual(
    expect.objectContaining({
      backgroundImageFit: defaults.backgroundImageFit,
      paddingTop: defaults.paddingTop,
      sourceImage: defaults.sourceImage,
    })
  );
});

it('defaults legacy blur and rejects explicitly invalid blur values', () => {
  const base = {
    backgroundColor: '#ffffff',
    backgroundGradientAngle: 90,
    backgroundGradientFrom: '#000000',
    backgroundGradientTo: '#ffffff',
    backgroundMode: 'color',
  };
  expect(parseSceneBackgroundSettings(base)).toMatchObject({ backgroundBlurAmount: 0 });
  expect(parseSceneBackgroundSettings({ ...base, backgroundBlurAmount: 25 })).toMatchObject({
    backgroundBlurAmount: 25,
  });
  for (const backgroundBlurAmount of [-1, 26, Number.NaN, '4']) {
    expect(parseSceneBackgroundSettings({ ...base, backgroundBlurAmount })).toBeNull();
  }
});

it('retains complete scene gradients and rejects malformed canonical gradients', () => {
  const backgroundGradient = {
    type: 'linear',
    angle: 37,
    interpolation: 'srgb-linear',
    repeat: { enabled: true, span: 0.25 },
    stops: [
      { id: 'a', color: '#ff000080', position: 0, midpoint: 0.2 },
      { id: 'b', color: '#0000ffff', position: 1, midpoint: 0.5 },
    ],
  };
  const base = createDefaultEditorPresetStorageState().sceneBackground.presets[0]!.settings;
  expect(parseSceneBackgroundSettings({ ...base, backgroundGradient })?.backgroundGradient).toEqual(
    backgroundGradient
  );
  expect(
    parseSceneBackgroundSettings({
      ...base,
      backgroundGradient: {
        ...backgroundGradient,
        stops: [{ id: 'a', color: 'bad', position: 0 }],
      },
    })
  ).toBeNull();
});
