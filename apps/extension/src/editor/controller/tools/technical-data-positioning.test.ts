// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { getCurrentLocaleMock } = vi.hoisted(() => ({
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

import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { createTechnicalDataTextObject } from './insertions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  getCurrentLocaleMock.mockReturnValue('en');
});

it('clamps technical data text inside the source bounds before preparing it', () => {
  const prepareObject = vi.fn();

  const result = createTechnicalDataTextObject({
    kinds: ['browser', 'url', 'date'],
    nextLabelIndex: 5,
    prepareObject,
    source: {
      displayHeight: 500,
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

  const drawing = readEditorDrawingObject(result);
  expect(result).toMatchObject({
    left: 30,
    sniptaleId: 'drawing-uuid-1',
    sniptaleRole: 'annotation',
    sniptaleType: 'text',
  });
  expect(result.top).toBeGreaterThanOrEqual(40);
  expect((result.top ?? 0) + result.getScaledHeight()).toBeLessThanOrEqual(500);
  expect(drawing).toMatchObject({
    id: 'drawing-uuid-1',
    kind: 'text',
    text: expect.stringContaining('https://example.com'),
  });
  expect(
    Math.abs((drawing?.kind === 'text' ? drawing.bounds.y : -1) - (result.top ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(prepareObject).toHaveBeenCalledWith(result);
});
