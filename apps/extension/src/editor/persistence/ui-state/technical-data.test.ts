import { beforeEach, expect, it, vi } from 'vitest';

const { localGetMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: localGetMock, set: localSetMock } },
}));

import {
  loadEditorTechnicalDataPreference,
  parseStoredEditorTechnicalDataPreference,
  saveEditorTechnicalDataPreference,
} from './technical-data';

beforeEach(() => vi.clearAllMocks());

it('accepts only known fields and restores canonical order', () => {
  expect(
    parseStoredEditorTechnicalDataPreference({
      kinds: ['browser', 'url', 'browser'],
      layout: 'row',
    })
  ).toEqual({ kinds: ['url', 'browser'], layout: 'row' });
  expect(
    parseStoredEditorTechnicalDataPreference({ kinds: ['url', 'unknown'], layout: 'wide' })
  ).toEqual({
    kinds: [],
    layout: 'column',
  });
  expect(parseStoredEditorTechnicalDataPreference(null)).toEqual({
    kinds: [],
    layout: 'column',
  });
});

it('loads the saved selection and layout, falling back when storage is unavailable', async () => {
  localGetMock
    .mockResolvedValueOnce({
      sniptale_editor_technical_data_preference: { kinds: ['date', 'browser'], layout: 'row' },
    })
    .mockRejectedValueOnce(new Error('storage unavailable'));

  await expect(loadEditorTechnicalDataPreference()).resolves.toEqual({
    kinds: ['date', 'browser'],
    layout: 'row',
  });
  await expect(loadEditorTechnicalDataPreference()).resolves.toEqual({
    kinds: [],
    layout: 'column',
  });
});

it('writes the chosen preference and reports a failed write', async () => {
  const preference = { kinds: ['url', 'date'] as const, layout: 'row' as const };
  localSetMock
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('quota'))
    .mockResolvedValueOnce(undefined);

  await saveEditorTechnicalDataPreference({
    kinds: [...preference.kinds],
    layout: preference.layout,
  });
  expect(localSetMock).toHaveBeenCalledWith(
    {
      sniptale_editor_technical_data_preference: preference,
    },
    expect.any(Object)
  );
  await expect(
    saveEditorTechnicalDataPreference({ kinds: [...preference.kinds], layout: preference.layout })
  ).rejects.toThrow('quota');
  await expect(
    saveEditorTechnicalDataPreference({ kinds: ['browser'], layout: 'column' })
  ).resolves.toBeUndefined();
});

it('serializes competing saves so the later insertion remains stored', async () => {
  let finishFirst: () => void = () => undefined;
  localSetMock
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        })
    )
    .mockResolvedValueOnce(undefined);

  const first = saveEditorTechnicalDataPreference({ kinds: ['url'], layout: 'column' });
  const second = saveEditorTechnicalDataPreference({ kinds: ['date'], layout: 'row' });
  await Promise.resolve();
  expect(localSetMock).toHaveBeenCalledTimes(1);

  finishFirst();
  await Promise.all([first, second]);
  expect(localSetMock).toHaveBeenNthCalledWith(
    2,
    {
      sniptale_editor_technical_data_preference: { kinds: ['date'], layout: 'row' },
    },
    expect.any(Object)
  );
});

it('waits for an in-flight insertion before a new picker loads the preference', async () => {
  let finishWrite: () => void = () => undefined;
  let storedPreference = { kinds: ['url'], layout: 'column' };
  localSetMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishWrite = () => {
          storedPreference = { kinds: ['date'], layout: 'row' };
          resolve();
        };
      })
  );
  localGetMock.mockImplementation(async () => ({
    sniptale_editor_technical_data_preference: storedPreference,
  }));

  const write = saveEditorTechnicalDataPreference({ kinds: ['date'], layout: 'row' });
  const read = loadEditorTechnicalDataPreference();
  await vi.waitFor(() => expect(localSetMock).toHaveBeenCalledTimes(1));
  expect(localGetMock).not.toHaveBeenCalled();

  finishWrite();
  await write;
  await expect(read).resolves.toEqual({ kinds: ['date'], layout: 'row' });
});
