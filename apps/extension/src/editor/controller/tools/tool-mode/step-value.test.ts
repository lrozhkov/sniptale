import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateStepSettingsMock: vi.fn(),
}));

let storeState: {
  toolSettings: {
    step: { alphabet: 'latin' | 'cyrillic'; type: 'number' | 'letter'; value: string };
  };
  updateStepSettings: typeof mocks.updateStepSettingsMock;
};

vi.mock('../../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/useEditorStore')>()),
  useEditorStore: { getState: () => storeState },
}));

import { advanceEditorStepValue } from './step-value';

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    toolSettings: {
      step: { alphabet: 'latin', type: 'number', value: '2' },
    },
    updateStepSettings: mocks.updateStepSettingsMock,
  };
});

it('advances step values through the editor store', () => {
  advanceEditorStepValue();

  expect(mocks.updateStepSettingsMock).toHaveBeenCalledWith({ value: '3' });
});
