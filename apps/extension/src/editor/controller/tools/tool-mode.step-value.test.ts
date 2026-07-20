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

vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: { getState: () => storeState },
}));

import { advanceEditorStepValue } from './tool-mode';

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    toolSettings: {
      step: { alphabet: 'latin', type: 'number', value: '2' },
    },
    updateStepSettings: mocks.updateStepSettingsMock,
  };
});

it('advances numeric and alphabetic step values through the store', () => {
  advanceEditorStepValue();
  expect(mocks.updateStepSettingsMock).toHaveBeenCalledWith({ value: '3' });

  storeState.toolSettings.step = { alphabet: 'latin', type: 'letter', value: 'A' };
  advanceEditorStepValue();
  expect(mocks.updateStepSettingsMock).toHaveBeenLastCalledWith({ value: 'B' });

  storeState.toolSettings.step = { alphabet: 'latin', type: 'number', value: '99' };
  advanceEditorStepValue();
  expect(mocks.updateStepSettingsMock).toHaveBeenLastCalledWith({ value: '99' });
});
