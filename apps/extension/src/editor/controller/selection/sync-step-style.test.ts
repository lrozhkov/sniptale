import { beforeEach, expect, it, vi } from 'vitest';

const selectionToolSettings = vi.hoisted(() => ({
  step: {
    alphabet: 'latin',
    color: '#222222',
    opacity: 1,
    sizeLevel: 3,
    strokeColor: '#f8fafc',
    strokeOpacity: 1,
    strokeWidth: 2,
    textColor: '#ffffff',
    type: 'number',
    value: '1',
  },
}));

const mocks = vi.hoisted(() => ({
  isGroupMock: vi.fn((object: { kind?: string }) => object.kind === 'group'),
  parseColorForStoreMock: vi.fn((value: unknown, fallback: string) =>
    value == null || value === '' ? fallback : `parsed:${String(value)}`
  ),
  updateSelectionStepSettingsMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      selectionToolSettings,
      updateSelectionStepSettings: mocks.updateSelectionStepSettingsMock,
    }),
  },
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isGroup: mocks.isGroupMock,
  parseColorForStore: mocks.parseColorForStoreMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs persisted step text, shape, and stroke metadata into the editor store', () => {
  syncSelectionToolSettingsFromObject(
    {
      getObjects: () => [
        { fill: '#00aa00', stroke: '#111111', strokeWidth: 4 },
        { fill: '#fafafa' },
      ],
      kind: 'group',
      sniptaleStepAlphabet: 'latin',
      sniptaleStepColor: '#00aa00',
      sniptaleStepOpacity: 0.75,
      sniptaleStepSizeLevel: 5,
      sniptaleStepStrokeColor: '#111111',
      sniptaleStepStrokeOpacity: 0.5,
      sniptaleStepStrokeWidth: 4,
      sniptaleStepTextColor: '#fafafa',
      sniptaleStepType: 'manual',
      sniptaleStepValue: 'QA',
    } as never,
    'step'
  );

  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      alphabet: 'latin',
      opacity: 0.75,
      sizeLevel: 5,
      strokeOpacity: 0.5,
      strokeWidth: 4,
      textColor: '#fafafa',
      type: 'manual',
      value: 'QA',
    })
  );
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      color: '#00aa00',
      strokeColor: '#111111',
      strokeWidth: 4,
      textColor: '#fafafa',
    })
  );
  expect(mocks.parseColorForStoreMock).not.toHaveBeenCalled();
});

it('parses rendered child colors when legacy step metadata is missing', () => {
  syncSelectionToolSettingsFromObject(
    {
      getObjects: () => [{ fill: '#00aa00', stroke: '#111111' }, { fill: '#fafafa' }],
      kind: 'group',
      sniptaleStepValue: '2',
    } as never,
    'step'
  );

  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      color: 'parsed:#00aa00',
      strokeColor: 'parsed:#111111',
      strokeWidth: 2,
      textColor: 'parsed:#fafafa',
    })
  );
});

it('keeps child-derived style untouched for non-groups and empty groups', () => {
  syncSelectionToolSettingsFromObject({ kind: 'step', sniptaleStepValue: '9' } as never, 'step');
  syncSelectionToolSettingsFromObject(
    { getObjects: () => [], kind: 'group', sniptaleStepValue: '10' } as never,
    'step'
  );
  syncSelectionToolSettingsFromObject({ kind: 'step' } as never, 'step');

  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenCalledTimes(3);
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ value: '9' })
  );
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ value: '10' })
  );
  expect(mocks.updateSelectionStepSettingsMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ value: '1' })
  );
});
