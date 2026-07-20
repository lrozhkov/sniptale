import { describe, expect, it, vi } from 'vitest';

const storeState = vi.hoisted(() => ({
  toolSettings: {
    callout: { tailSide: 'top' },
  },
}));

const mocks = vi.hoisted(() => ({
  createRichShapeCalloutObjectMock: vi.fn(() => ({ id: 'callout-object' })),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  createRichShapeCalloutObject: mocks.createRichShapeCalloutObjectMock,
}));

import { handleCalloutMouseDown } from './drawing-callout-actions';

function createBindings() {
  return {
    nextLabelIndex: vi.fn(() => 4),
    prepareObject: vi.fn(),
    startDrawSession: vi.fn(),
  };
}

describe('editor-controller-events-drawing.callout-actions', () => {
  it('creates dynamic callout rich shape drag sessions from callout tool settings', () => {
    const bindings = createBindings();
    const point = { x: 34, y: 45 } as never;

    handleCalloutMouseDown(bindings as never, point);

    expect(mocks.createRichShapeCalloutObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        height: 1,
        labelIndex: 4,
        left: 34,
        settings: storeState.toolSettings.callout,
        top: 45,
        width: 1,
      })
    );
    expect(bindings.prepareObject).toHaveBeenCalledWith({ id: 'callout-object' });
    expect(bindings.startDrawSession).toHaveBeenCalledWith('rich-shape', point, {
      id: 'callout-object',
    });
  });
});
