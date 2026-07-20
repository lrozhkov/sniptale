import { expect, it, vi } from 'vitest';

const roleMocks = vi.hoisted(() => ({
  applyArrowSettings: vi.fn(),
  applyBlurSettings: vi.fn(),
  applyBrushSettings: vi.fn(),
  applyImageLayerSettings: vi.fn(),
  applyLineSettings: vi.fn(),
  applyRichShapeSettings: vi.fn(),
  applyShapeSelectionSettings: vi.fn(),
  applyStepSettings: vi.fn(),
  applyTextSelectionSettings: vi.fn(),
}));

vi.mock('../apply-text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apply-text')>()),
  applyTextSelectionSettings: roleMocks.applyTextSelectionSettings,
}));

vi.mock('./annotation', () => ({
  applyBlurSettings: roleMocks.applyBlurSettings,
  applyStepSettings: roleMocks.applyStepSettings,
}));

vi.mock('./brush', () => ({
  applyBrushSettings: roleMocks.applyBrushSettings,
}));

vi.mock('./image', () => ({
  applyImageLayerSettings: roleMocks.applyImageLayerSettings,
}));

vi.mock('./line', () => ({
  applyArrowSettings: roleMocks.applyArrowSettings,
  applyLineSettings: roleMocks.applyLineSettings,
}));

vi.mock('./rich-shape', () => ({
  applyRichShapeSettings: roleMocks.applyRichShapeSettings,
}));

vi.mock('./shape', () => ({
  applyShapeSelectionSettings: roleMocks.applyShapeSelectionSettings,
}));

import { applySelectionToolSettingsToObjects } from './dispatch';

const objects = [{ id: 'selected' }] as never;
const settings = {
  arrow: { width: 4 },
  blur: { amount: 12 },
  image: { borderRadius: 2 },
  line: { width: 2 },
  pencil: { color: '#111111' },
  step: { value: '1' },
  text: { color: '#222222' },
};

it('routes selection settings by selected object type', () => {
  applySelectionToolSettingsToObjects(objects, 'image', settings as never);
  applySelectionToolSettingsToObjects(objects, 'pencil', settings as never);
  applySelectionToolSettingsToObjects(objects, 'rectangle', settings as never);
  applySelectionToolSettingsToObjects(objects, 'blur', settings as never);
  applySelectionToolSettingsToObjects(objects, 'text', settings as never);
  applySelectionToolSettingsToObjects(objects, 'meta-stamp', settings as never);
  applySelectionToolSettingsToObjects(objects, 'step', settings as never);
  applySelectionToolSettingsToObjects(objects, 'arrow', settings as never);
  applySelectionToolSettingsToObjects(objects, 'line', settings as never);
  applySelectionToolSettingsToObjects(objects, 'rich-shape', settings as never);
  applySelectionToolSettingsToObjects(objects, 'browser-frame', settings as never);

  expect(roleMocks.applyImageLayerSettings).toHaveBeenCalledWith(objects, settings.image);
  expect(roleMocks.applyBrushSettings).toHaveBeenCalledWith(objects, settings.pencil);
  expect(roleMocks.applyShapeSelectionSettings).toHaveBeenCalledWith(
    objects,
    'rectangle',
    settings
  );
  expect(roleMocks.applyBlurSettings).toHaveBeenCalledWith(objects, settings.blur);
  expect(roleMocks.applyTextSelectionSettings).toHaveBeenCalledWith(objects, settings.text, {
    forcePlain: true,
  });
  expect(roleMocks.applyTextSelectionSettings).toHaveBeenCalledWith(objects, settings.text);
  expect(roleMocks.applyStepSettings).toHaveBeenCalledWith(objects, settings.step);
  expect(roleMocks.applyArrowSettings).toHaveBeenCalledWith(objects, settings.arrow);
  expect(roleMocks.applyLineSettings).toHaveBeenCalledWith(objects, settings.line);
  expect(roleMocks.applyRichShapeSettings).toHaveBeenCalledWith(objects, settings);
});
