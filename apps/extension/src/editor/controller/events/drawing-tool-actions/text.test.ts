import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingBindings } from '../drawing-tool-actions.test-support';

const storeState = vi.hoisted(() => ({
  toolSettings: {
    text: { calloutFormat: 'panel' as 'plain' | 'panel' | 'bubble' | 'pointer' },
  },
}));

const mocks = vi.hoisted(() => ({
  createTextObject: vi.fn(() => ({
    enterEditing: vi.fn(),
    id: 'text-object',
    selectAll: vi.fn(),
  })),
  resizeTextCallout: vi.fn(),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../../objects/annotation/text/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/object')>()),
  createTextObject: mocks.createTextObject,
}));

vi.mock('../../../objects/annotation/text/callout/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text/callout/resize')>()),
  resizeTextCallout: mocks.resizeTextCallout,
}));

import { handleTextMouseDown } from './text';

beforeEach(() => {
  vi.clearAllMocks();
  storeState.toolSettings.text.calloutFormat = 'panel';
});

it('creates text draw sessions without switching tools or entering edit mode', () => {
  const bindings = createDrawingBindings();
  const point = { x: 40, y: 48 } as never;
  const text = { enterEditing: vi.fn(), id: 'text-object', selectAll: vi.fn() };
  mocks.createTextObject.mockReturnValueOnce(text);

  handleTextMouseDown(bindings as never, point);

  expect(mocks.createTextObject).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        calloutFormat: 'plain',
        layoutMode: 'fixed-width',
      }),
    })
  );
  expect(mocks.resizeTextCallout).toHaveBeenCalledWith(text, 1, 1);
  expect(bindings.startDrawSession).toHaveBeenCalledWith('text', point, text);
  expect(bindings.addObject).not.toHaveBeenCalledWith(text);
  expect(text.enterEditing).not.toHaveBeenCalled();
  expect(text.selectAll).not.toHaveBeenCalled();
  expect(bindings.switchToSelectTool).not.toHaveBeenCalled();
});

it('forces plain text creation regardless of legacy stored callout format', () => {
  const bindings = createDrawingBindings();
  const point = { x: 12, y: 16 } as never;

  storeState.toolSettings.text.calloutFormat = 'plain';
  handleTextMouseDown(bindings as never, point);

  storeState.toolSettings.text.calloutFormat = 'pointer';
  handleTextMouseDown(bindings as never, point);

  expect(mocks.createTextObject).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      settings: expect.objectContaining({ calloutFormat: 'plain' }),
    })
  );
  expect(mocks.createTextObject).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      settings: expect.objectContaining({ calloutFormat: 'plain' }),
    })
  );
});
