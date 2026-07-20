// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { isTechnicalCellMock } = vi.hoisted(() => ({
  isTechnicalCellMock: vi.fn(),
}));

vi.mock('../cell', () => ({
  isTechnicalCell: isTechnicalCellMock,
}));

import {
  buildHeaderToCellMapping,
  findTargetCellByHeader,
  findTargetCellByNodeData,
} from './mapping';

function createTableFixture() {
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th></th>
        <th>Автор</th>
        <th>Дата</th>
        <th>Текст комментария</th>
      </tr>
    </thead>
    <tbody>
      <tr data-row="1">
        <td><input type="checkbox" /></td>
        <td data-cell="author">Лев</td>
        <td data-cell="date">31.03.2026</td>
        <td data-cell="text">Старый текст</td>
      </tr>
    </tbody>
  `;
  document.body.appendChild(table);
  return {
    rowElement: table.querySelector('tr[data-row="1"]') as HTMLElement,
    table,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  isTechnicalCellMock.mockReset();
  isTechnicalCellMock
    .mockReturnValueOnce({ isTechnical: true, type: 'select-box' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: true, type: 'select-box' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' })
    .mockReturnValueOnce({ isTechnical: false, type: 'data' });
});

it('builds header mappings while skipping technical columns and resolves partial matches', () => {
  const logger = { debug: vi.fn() };
  const { rowElement, table } = createTableFixture();
  const mapping = buildHeaderToCellMapping(table, rowElement, logger);

  expect(Array.from(mapping.keys())).toEqual(['Автор', 'Дата', 'Текст комментария']);
  expect(findTargetCellByHeader(mapping, 'Текст', logger)).toBe(
    rowElement.querySelector('[data-cell="text"]')
  );
});

it('falls back to node-data index resolution for unmatched headers', () => {
  const logger = { debug: vi.fn() };
  const { rowElement } = createTableFixture();

  expect(
    findTargetCellByNodeData(
      rowElement,
      {
        data: { Автор: 'Лев', Дата: '31.03.2026' },
        id: 'row-1',
        selected: true,
        selector: '[data-row="1"]',
      },
      'Дата',
      logger
    )
  ).toBe(rowElement.querySelector('[data-cell="date"]'));
});
