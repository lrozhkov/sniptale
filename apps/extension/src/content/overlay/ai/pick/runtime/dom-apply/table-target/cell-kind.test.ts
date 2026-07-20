// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { determineCellTypeFromDOMMock } = vi.hoisted(() => ({
  determineCellTypeFromDOMMock: vi.fn(),
}));

vi.mock('../cell', () => ({
  determineCellTypeFromDOM: determineCellTypeFromDOMMock,
}));

import { shouldSkipComplexTableCell } from './cell-kind';

beforeEach(() => {
  determineCellTypeFromDOMMock.mockReset();
});

it('skips complex cells when DOM detection resolves image or status', () => {
  determineCellTypeFromDOMMock.mockReturnValue('status');

  expect(
    shouldSkipComplexTableCell(
      {
        data: { Статус: 'Done' },
        id: 'row-1',
        selected: true,
        selector: '[data-row=\"1\"]',
      },
      document.createElement('td'),
      'Статус'
    )
  ).toBe(true);
});

it('keeps simple cells editable when row metadata already carries a safe type', () => {
  expect(
    shouldSkipComplexTableCell(
      {
        cellTypes: { Автор: 'string' },
        data: { Автор: 'Лев' },
        id: 'row-1',
        selected: true,
        selector: '[data-row=\"1\"]',
      },
      document.createElement('td'),
      'Автор'
    )
  ).toBe(false);
  expect(determineCellTypeFromDOMMock).not.toHaveBeenCalled();
});
