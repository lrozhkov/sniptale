// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { parseDOMTree } from '..';
import {
  createNaumenMvsContainer,
  setupCardPageContext,
  silenceParserConsole,
} from '../../../../../../../tooling/test/support/content/dom-tree-parser/mvs/test-helpers';

describe('dom tree parser mvs iframe support', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    document.title = '';
  });

  it('extracts MVS summary and card fields while ignoring iframe chrome', () => {
    silenceParserConsole();
    setupCardPageContext();
    createNaumenMvsContainer();

    const tree = parseDOMTree();
    const fields = tree.structure.flatMap((section) =>
      section.children.filter((child): child is FieldNode => child.type === 'field')
    );
    const labels = fields.map((field) => field.label);
    const values = fields.map((field) => field.value);

    expect(labels).toEqual(
      expect.arrayContaining([
        'Лицензии / Менеджеры услуги',
        'Антивирусное ПО (6912) / Системный статус',
        'Антивирусное ПО (6912) / Тип Актива / КЕ',
      ])
    );
    expect(values).toEqual(
      expect.arrayContaining(['Мелихов Игорь Андреевич', 'Активно', 'Программное обеспечение'])
    );
    expect(labels).not.toContain('минут');
    expect(values).not.toContain('3');
  });
});
