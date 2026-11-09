import { expect, it, vi } from 'vitest';

it('falls back image shadow geometry when shape defaults omit optional shadow fields', async () => {
  vi.resetModules();
  vi.doMock('./highlighter-projection', async () => ({
    ...(await vi.importActual<typeof import('./highlighter-projection')>(
      './highlighter-projection'
    )),
    projectBorderPresetToEditorShapeSettings: () => ({
      borderPresetId: 'preset-1',
      radius: 8,
      shadow: 20,
      strokeColor: '#123456',
      strokeOpacity: 0.5,
      strokeStyle: 'dash',
      strokeWidth: 2,
    }),
  }));

  const { DEFAULT_EDITOR_TOOL_SETTINGS } = await import('./tool-defaults');
  const settings = DEFAULT_EDITOR_TOOL_SETTINGS({ id: 'preset-1' } as never);

  expect(settings.image).toEqual(
    expect.objectContaining({
      shadowAngle: 90,
      shadowBlur: 12,
      shadowDistance: 4,
    })
  );

  vi.resetModules();
  vi.doUnmock('./highlighter-projection');
});

it('scales source glow with image extent with a stronger full-size range', async () => {
  const { resolveEditorSourceImageGlowBlur, DEFAULT_EDITOR_IMAGE_SETTINGS } =
    await import('./image-types');
  const settings = { ...DEFAULT_EDITOR_IMAGE_SETTINGS, shadow: 100 };
  expect(resolveEditorSourceImageGlowBlur(settings, 1000)).toBe(150);
  expect(resolveEditorSourceImageGlowBlur(settings, 4000)).toBe(600);
  expect(resolveEditorSourceImageGlowBlur({ ...settings, shadow: 0 }, 4000)).toBe(0);
  expect(resolveEditorSourceImageGlowBlur(settings, Infinity)).toBe(150);
});
