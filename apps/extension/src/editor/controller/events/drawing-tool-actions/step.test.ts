import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingBindings } from '../drawing-tool-actions.test-support';

const storeState = vi.hoisted(() => ({
  toolSettings: {
    step: { value: '3' },
  },
}));

const mocks = vi.hoisted(() => ({
  createStepGroup: vi.fn(() => ({ id: 'step-object' })),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../../objects/annotation/step', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/step')>()),
  createStepGroup: mocks.createStepGroup,
}));

import { handleStepMouseDown } from './step';

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates step annotations and advances the step value', () => {
  const bindings = createDrawingBindings();
  const point = { x: 40, y: 48 } as never;

  handleStepMouseDown(bindings as never, point);

  expect(mocks.createStepGroup).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 40,
      settings: { value: '3' },
      top: 48,
    })
  );
  expect(bindings.addObject).toHaveBeenCalledWith({ id: 'step-object' });
  expect(bindings.advanceStepValue).toHaveBeenCalledOnce();
});
