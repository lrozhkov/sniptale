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
