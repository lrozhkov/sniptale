// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { createMetaStampMock, getCurrentLocaleMock } = vi.hoisted(() => ({
  createMetaStampMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: vi.fn(() => 'Apr 7, 2026, 10:15 AM'),
  getCurrentLocale: getCurrentLocaleMock,
  translate: vi.fn((key: string) => key),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  getBrowserVersion: vi.fn(() => 'Chrome 136'),
}));

vi.mock('../../objects/meta-stamp/factory', () => ({
  createMetaStamp: createMetaStampMock,
}));

import { createTechnicalDataTextObject } from './insertions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  getCurrentLocaleMock.mockReturnValue('en');
});

it('clamps technical data text inside the source bounds before preparing it', () => {
  const set = vi.fn();
  const text = {
    getScaledHeight: vi.fn(() => 120),
    getScaledWidth: vi.fn(() => 260),
    id: 'text',
    set,
  };
  const prepareObject = vi.fn();
  createMetaStampMock.mockReturnValue(text);

  const result = createTechnicalDataTextObject({
    kinds: ['browser', 'url', 'date'],
    nextLabelIndex: 5,
    prepareObject,
    source: {
      displayHeight: 150,
      displayWidth: 300,
      left: 10,
      top: 20,
    } as never,
    sourceTitle: 'Welcome',
    sourceUrl: 'https://example.com',
    textSettings: {
      backgroundColor: '#123456',
      color: '#ffffff',
      fontFamily: 'mono',
      fontSize: 16,
    },
  });

  expect(set).toHaveBeenCalledWith({ left: 30, top: 40 });
  expect(prepareObject).toHaveBeenCalledWith(text);
  expect(result).toBe(text);
});
