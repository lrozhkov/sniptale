import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyShapeSettings: vi.fn(),
  getEditorShapeSettings: vi.fn(() => ({ fill: '#123456' })),
}));

vi.mock('../../../../features/editor/document/shape-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/editor/document/shape-settings')>()),
  getEditorShapeSettings: mocks.getEditorShapeSettings,
}));

vi.mock('../../../objects/shape-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/shape-style')>()),
  applyShapeSettings: mocks.applyShapeSettings,
}));

import { applyShapeSelectionSettings } from './shape';

it('resolves shape settings and applies them to selected shape objects', () => {
  const object = { id: 'shape' };
  const toolSettings = { rectangle: { fill: '#abcdef' } };

  applyShapeSelectionSettings([object] as never, 'rectangle', toolSettings as never);

  expect(mocks.getEditorShapeSettings).toHaveBeenCalledWith(toolSettings, 'rectangle');
  expect(mocks.applyShapeSettings).toHaveBeenCalledWith(object, 'rectangle', { fill: '#123456' });
});
