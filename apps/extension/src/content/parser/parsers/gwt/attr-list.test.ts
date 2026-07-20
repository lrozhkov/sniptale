// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../dom-tree-parser/traversal';
import { GWTAttrListParser, parseGwtAttrListElement } from './attr-list';

function buildAttrListTable(labelText = 'Статус:', valueText = 'В работе') {
  const table = document.createElement('table');
  table.className = 'attrList';
  const tbody = document.createElement('tbody');
  const row = document.createElement('tr');
  const titleCell = document.createElement('td');
  titleCell.className = 'attrTitle';
  titleCell.textContent = labelText;
  const valueCell = document.createElement('td');
  valueCell.className = 'attrValue';
  valueCell.textContent = valueText;
  row.append(titleCell, valueCell);
  tbody.append(row);
  table.append(tbody);
  document.body.append(table);
  return table;
}

function registerParserCanParseTest() {
  it('matches attrList tables unless they are already processed and delegates parse()', () => {
    const parser = new GWTAttrListParser();
    const table = buildAttrListTable();
    const ctx = initContext();

    expect(parser.canParse(table, ctx)).toBe(true);
    expect(parser.parse(table, ctx)).toEqual(
      expect.objectContaining({
        fields: [
          expect.objectContaining({
            label: 'Статус',
            value: 'В работе',
          }),
        ],
      })
    );
    ctx.processedAttrLists.add(table);
    expect(parser.canParse(table, ctx)).toBe(false);
  });
}

function registerOrphanSectionTest() {
  it('creates an orphan section and marks the table processed', () => {
    const ctx = initContext();
    const table = buildAttrListTable('Приоритет:', 'Высокий');

    const result = parseGwtAttrListElement(table, ctx);

    expect(result.fields).toEqual([
      expect.objectContaining({
        label: 'Приоритет',
        value: 'Высокий',
      }),
    ]);
    expect(ctx.currentSection?.title).toBe('Атрибуты');
    expect(ctx.currentSection?.children).toEqual(result.fields ?? []);
    expect(ctx.processedAttrLists.has(table)).toBe(true);
  });
}

function registerExistingSectionReuseTest() {
  it('appends parsed fields into the current section instead of creating a new one', () => {
    const ctx = initContext();
    const existingSection = {
      type: 'section' as const,
      id: 'section-existing',
      title: 'Карточка',
      children: [],
      selected: true,
      kind: 'record' as const,
    };
    ctx.result.structure.push(existingSection);
    ctx.currentSection = existingSection;

    const table = buildAttrListTable('Исполнитель:', 'Иван');
    parseGwtAttrListElement(table, ctx);

    expect(ctx.result.structure).toHaveLength(1);
    expect(existingSection.children).toEqual([
      expect.objectContaining({
        label: 'Исполнитель',
        value: 'Иван',
      }),
    ]);
  });
}

describe('gwt attr list parser', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerParserCanParseTest();
  registerOrphanSectionTest();
  registerExistingSectionReuseTest();
});
