import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock, warnMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
  warnMock: vi.fn(),
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: warnMock }),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  loadHighlighterAdditionalSettingsOpen,
  saveHighlighterAdditionalSettingsOpen,
} from './additional-settings';

beforeEach(() => vi.clearAllMocks());

it('loads and saves an independent flag for every additional-settings section', async () => {
  getMock.mockResolvedValue({ sniptale_highlighter_callout_text_additional_open: true });
  setMock.mockResolvedValue(undefined);

  await expect(loadHighlighterAdditionalSettingsOpen('callout-text')).resolves.toBe(true);
  expect(getMock).toHaveBeenCalledWith(['sniptale_highlighter_callout_text_additional_open']);

  await saveHighlighterAdditionalSettingsOpen('callout-connector', true);
  expect(setMock).toHaveBeenCalledWith({
    sniptale_highlighter_callout_connector_additional_open: true,
  });
});

it('falls back for invalid state and treats persistence failures as non-blocking UI errors', async () => {
  getMock.mockResolvedValue({ sniptale_highlighter_callout_title_additional_open: 'yes' });
  setMock.mockRejectedValue(new Error('unavailable'));

  await expect(loadHighlighterAdditionalSettingsOpen('callout-title')).resolves.toBe(false);
  await expect(
    saveHighlighterAdditionalSettingsOpen('callout-title', false)
  ).resolves.toBeUndefined();
  expect(warnMock).toHaveBeenCalledTimes(2);
});
