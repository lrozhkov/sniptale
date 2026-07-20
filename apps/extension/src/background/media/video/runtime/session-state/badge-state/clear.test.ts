import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setBadgeText: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: {
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    setBadgeText: mocks.setBadgeText,
    setTitle: mocks.setTitle,
  },
}));

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { clearBadgeState } from './clear';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clearBadgeState', () => {
  it('clears the badge and resets the title', () => {
    clearBadgeState();

    expect(mocks.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mocks.setTitle).toHaveBeenCalledWith({ title: 'background.runtime.actionOpenApp' });
  });
});
