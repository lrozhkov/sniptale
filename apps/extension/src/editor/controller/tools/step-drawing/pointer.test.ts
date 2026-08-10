import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createStepGroup: vi.fn(() => ({ id: 'step' })),
  state: { toolSettings: { step: { value: '1' } } },
}));
vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => mocks.state },
}));
vi.mock('../../../objects/annotation/step', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/step')>()),
  createStepGroup: mocks.createStepGroup,
}));

import { handleStepMouseDown } from './pointer';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'step-id' });
});

it('creates, adds, and advances a step annotation', () => {
  const bindings = {
    addObject: vi.fn(),
    advanceStepValue: vi.fn(),
    nextLabelIndex: vi.fn(() => 4),
  };

  Reflect.apply(handleStepMouseDown, null, [bindings, { x: 20, y: 30 }]);

  expect(mocks.createStepGroup).toHaveBeenCalledWith({
    id: 'step-id',
    labelIndex: 4,
    left: 20,
    settings: mocks.state.toolSettings.step,
    top: 30,
  });
  expect(bindings.addObject).toHaveBeenCalledWith({ id: 'step' });
  expect(bindings.advanceStepValue).toHaveBeenCalledOnce();
});
