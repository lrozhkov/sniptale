import { expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../../features/editor/document/constants';
import {
  changeFrameBackgroundMode,
  disableFrameBackground,
  isFrameBackgroundNone,
} from './settings';

it('disables the background without changing window header fields, then restores usable defaults', () => {
  const frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    browserTitle: 'Title',
    browserUrl: 'https://example.com',
    backgroundImageData: 'data:image/png;base64,AA==',
  };
  const none = disableFrameBackground(frame);
  expect(isFrameBackgroundNone(none)).toBe(true);
  expect(none.backgroundImageData).toBeNull();
  expect(none.sourceImage).toEqual(DEFAULT_EDITOR_IMAGE_SETTINGS);
  expect(none.browserTitle).toBe('Title');
  expect(none.browserUrl).toBe(frame.browserUrl);
  for (const mode of ['color', 'gradient', 'image'] as const) {
    const active = changeFrameBackgroundMode(none, mode);
    expect(isFrameBackgroundNone(active)).toBe(false);
    expect(active).toMatchObject({
      backgroundMode: mode,
      paddingTop: 32,
      sourceImage: { radius: 12 },
    });
  }
});

it('keeps configured geometry and style when switching active background types', () => {
  const frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 71,
    sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, radius: 23 },
  };
  expect(changeFrameBackgroundMode(frame, 'image')).toEqual({ ...frame, backgroundMode: 'image' });
});

it('resets active mode parameters without disabling the mode or replacing its image', async () => {
  const { resetFrameBackground } = await import('./settings');
  for (const mode of ['color', 'gradient', 'image'] as const) {
    const frame = {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundMode: mode,
      backgroundImageData: 'selected-image',
      backgroundImageFit: 'tile' as const,
      backgroundBlurAmount: 20,
      paddingTop: 91,
      browserTitle: 'Preserved',
      sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, radius: 77 },
    };
    const reset = resetFrameBackground(frame);
    expect(isFrameBackgroundNone(reset)).toBe(false);
    expect(reset).toMatchObject({
      backgroundMode: mode,
      backgroundImageData: 'selected-image',
      backgroundImageFit: mode === 'image' ? 'cover' : 'tile',
      backgroundBlurAmount: 0,
      paddingTop: 32,
      browserTitle: 'Preserved',
      sourceImage: { radius: 12, shadow: 14 },
    });
  }
  const none = disableFrameBackground(DEFAULT_EDITOR_FRAME_SETTINGS);
  expect(resetFrameBackground(none)).toBe(none);
});

it('resets the rendered canonical gradient after editing it in the paint picker', async () => {
  const {
    createEditorFramePaintGradientPatch,
    resolveEditorFrameGradient,
    createEditorFrameGradientCss,
  } = await import('../../../../features/editor/document/frame-gradient');
  const { resetFrameBackground } = await import('./settings');
  const custom = { ...resolveEditorFrameGradient(DEFAULT_EDITOR_FRAME_SETTINGS), angle: 23 };
  const frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    ...createEditorFramePaintGradientPatch(custom),
  };
  expect(frame.backgroundGradient).toBeDefined();
  const reset = resetFrameBackground(frame);
  expect(reset.backgroundMode).toBe('gradient');
  expect(resolveEditorFrameGradient(reset)).toEqual(
    resolveEditorFrameGradient(DEFAULT_EDITOR_FRAME_SETTINGS)
  );
  const { useEditorStore } = await import('../../../state/useEditorStore');
  const { normalizeEditorFrameSettings } =
    await import('../../../../features/editor/document/constants');
  const previous = useEditorStore.getState().frame;
  try {
    useEditorStore.setState({ frame });
    useEditorStore.getState().updateFrame(normalizeEditorFrameSettings(reset));
    expect(resolveEditorFrameGradient(useEditorStore.getState().frame)).toEqual(
      resolveEditorFrameGradient(normalizeEditorFrameSettings(reset))
    );
  } finally {
    useEditorStore.setState({ frame: previous });
  }

  expect(createEditorFrameGradientCss(reset)).toBe(
    createEditorFrameGradientCss({
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      backgroundGradient: resolveEditorFrameGradient(DEFAULT_EDITOR_FRAME_SETTINGS),
    })
  );
});

it('disables Reset for canonical defaults and equivalent colors without comparing image bytes', async () => {
  const { isFrameBackgroundDefault, resetFrameBackground } = await import('./settings');
  const image = resetFrameBackground({
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundMode: 'image',
    backgroundImageData: 'first',
  });
  expect(isFrameBackgroundDefault(image)).toBe(true);
  expect(isFrameBackgroundDefault({ ...image, backgroundImageData: 'another' })).toBe(true);
  expect(isFrameBackgroundDefault({ ...image, backgroundBlurAmount: 5 })).toBe(false);
  expect(isFrameBackgroundDefault({ ...image, paddingTop: 55 })).toBe(false);
  expect(
    isFrameBackgroundDefault({ ...image, sourceImage: { ...image.sourceImage!, strokeWidth: 3 } })
  ).toBe(false);
  const startup = changeFrameBackgroundMode(
    disableFrameBackground(DEFAULT_EDITOR_FRAME_SETTINGS),
    'color'
  );
  expect(isFrameBackgroundDefault(startup)).toBe(true);
  expect(
    isFrameBackgroundDefault(
      changeFrameBackgroundMode(disableFrameBackground(DEFAULT_EDITOR_FRAME_SETTINGS), 'image')
    )
  ).toBe(true);
  const color = resetFrameBackground({ ...image, backgroundMode: 'color' });
  expect(isFrameBackgroundDefault({ ...color, backgroundColor: '#fff' })).toBe(true);
  const gradient = resetFrameBackground({ ...image, backgroundMode: 'gradient' });
  expect(
    isFrameBackgroundDefault({
      ...gradient,
      backgroundGradient: {
        ...gradient.backgroundGradient!,
        stops: gradient.backgroundGradient!.stops.map((stop) => ({
          ...stop,
          id: 'another-' + stop.id,
        })),
      },
    })
  ).toBe(true);
});
