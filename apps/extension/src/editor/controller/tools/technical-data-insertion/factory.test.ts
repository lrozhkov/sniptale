import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTextObjectMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(() => 'en'),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  getCurrentLocale: mocks.getCurrentLocaleMock,
}));

vi.mock('../../../objects/annotation/text', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/text')>()),
  createTextObject: mocks.createTextObjectMock,
}));

import { createTechnicalDataTextObject } from './factory';

it('creates, sizes, positions, and prepares the technical data text object', () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000002');
  const text = { height: 40, set: vi.fn(), width: 280 };
  const prepareObject = vi.fn();
  mocks.createTextObjectMock.mockReturnValue(text);

  expect(
    createTechnicalDataTextObject({
      kinds: ['url'],
      nextLabelIndex: 2,
      prepareObject,
      source: { displayHeight: 100, displayWidth: 120, left: 10, top: 20 } as never,
      sourceTitle: '',
      sourceUrl: 'https://example.com',
      textSettings: {
        fontFamily: 'inter',
        fontSize: 16,
        fontStyle: 'normal',
        fontWeight: '400',
      } as never,
    })
  ).toBe(text);

  expect(mocks.createTextObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000002',
      labelIndex: 2,
      settings: expect.objectContaining({ calloutFormat: 'plain' }),
    })
  );
  expect(prepareObject).toHaveBeenCalledWith(text);
  randomUUID.mockRestore();
});
