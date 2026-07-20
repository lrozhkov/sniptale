import { expect, it } from 'vitest';

import { parseTrashEntry } from './trash';

it('parses trash entries that contain valid steps', () => {
  const entry = parseTrashEntry({
    deletedAt: 30,
    originalIndex: 1,
    step: {
      id: 'trashed-note',
      kind: 'note',
      title: 'Deleted',
      body: 'Can be restored',
      createdAt: 21,
      updatedAt: 22,
      tone: 'warning',
    },
  });

  expect(entry).toEqual(
    expect.objectContaining({
      deletedAt: 30,
      originalIndex: 1,
      step: expect.objectContaining({ id: 'trashed-note' }),
    })
  );
});

it('rejects trash entries with invalid structure or invalid steps', () => {
  expect(parseTrashEntry(undefined)).toBeNull();
  expect(
    parseTrashEntry({
      deletedAt: 'now',
      originalIndex: 2,
      step: {
        id: 'invalid-trash',
        kind: 'divider',
      },
    })
  ).toBeNull();

  expect(
    parseTrashEntry({
      deletedAt: 30,
      originalIndex: 1,
      step: {
        id: 'broken-capture',
        kind: 'capture',
      },
    })
  ).toBeNull();
});
