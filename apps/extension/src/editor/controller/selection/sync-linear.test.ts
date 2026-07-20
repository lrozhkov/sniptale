import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArrowSettingsMock: vi.fn(),
  getLineSettingsMock: vi.fn(),
  isArrowObjectMock: vi.fn(() => false),
  isLineObjectMock: vi.fn(() => false),
  updateSelectionArrowSettingsMock: vi.fn(),
  updateSelectionLineSettingsMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      updateSelectionArrowSettings: mocks.updateSelectionArrowSettingsMock,
      updateSelectionLineSettings: mocks.updateSelectionLineSettingsMock,
    }),
  },
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  getArrowSettings: mocks.getArrowSettingsMock,
  isArrowObject: mocks.isArrowObjectMock,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  getLineSettings: mocks.getLineSettingsMock,
  isLineObject: mocks.isLineObjectMock,
}));

import { syncSelectionToolSettingsFromObject } from './sync';
import { syncArrowSelectionSettings, syncLineSelectionSettings } from './sync-linear';

it('syncs arrow type, dynamic width, heads, and style settings', () => {
  mocks.isArrowObjectMock.mockReturnValue(true);
  mocks.getArrowSettingsMock.mockReturnValue({
    arrowType: 'elbow',
    color: '#222222',
    dynamicWidth: true,
    endHead: 'triangle',
    mode: 'straight',
    opacity: 0.8,
    shadow: 60,
    startHead: 'none',
    variant: 'tapered',
    width: 6,
  });

  syncArrowSelectionSettings({} as never);

  expect(mocks.updateSelectionArrowSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      arrowType: 'elbow',
      dynamicWidth: true,
      variant: 'tapered',
      width: 6,
    })
  );
});

it('syncs line settings only for line objects', () => {
  const lineSettings = {
    color: '#123456',
    corners: 'round',
    fillMode: 'none',
    opacity: 1,
    roughness: 0,
    style: 'solid',
    width: 3,
  };
  mocks.isLineObjectMock.mockReturnValue(true);
  mocks.getLineSettingsMock.mockReturnValue(lineSettings);

  syncLineSelectionSettings({} as never);

  expect(mocks.updateSelectionLineSettingsMock).toHaveBeenCalledWith(lineSettings);
  mocks.isLineObjectMock.mockReturnValue(false);
  syncLineSelectionSettings({} as never);
  expect(mocks.updateSelectionLineSettingsMock).toHaveBeenCalledTimes(1);
});

it('routes line objects through the shared selection settings sync', () => {
  mocks.isLineObjectMock.mockReturnValue(true);
  mocks.getLineSettingsMock.mockReturnValue({ color: '#456789', width: 4 });

  syncSelectionToolSettingsFromObject({} as never, 'line');

  expect(mocks.updateSelectionLineSettingsMock).toHaveBeenCalledWith({
    color: '#456789',
    width: 4,
  });
});
