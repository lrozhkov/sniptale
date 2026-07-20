import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  loadScenarioEditorNavigatorCollapsed,
  saveScenarioEditorNavigatorCollapsed,
} from './navigator-state';

beforeEach(() => vi.clearAllMocks());

it('owns scenario navigator preference lifecycle', async () => {
  getMock.mockResolvedValue({ sniptale_scenario_editor_navigator_collapsed: true });
  setMock.mockResolvedValue(undefined);

  await expect(loadScenarioEditorNavigatorCollapsed()).resolves.toBe(true);
  await expect(saveScenarioEditorNavigatorCollapsed(false)).resolves.toBeUndefined();
  expect(setMock).toHaveBeenCalledWith({ sniptale_scenario_editor_navigator_collapsed: false });
});

it('fails soft for invalid, unavailable, and failed navigator persistence', async () => {
  getMock
    .mockResolvedValueOnce({ sniptale_scenario_editor_navigator_collapsed: 'yes' })
    .mockRejectedValueOnce(new Error('unavailable'));
  setMock.mockRejectedValueOnce(new Error('quota'));

  await expect(loadScenarioEditorNavigatorCollapsed()).resolves.toBe(false);
  await expect(loadScenarioEditorNavigatorCollapsed()).resolves.toBe(false);
  await expect(saveScenarioEditorNavigatorCollapsed(true)).resolves.toBeUndefined();
});
