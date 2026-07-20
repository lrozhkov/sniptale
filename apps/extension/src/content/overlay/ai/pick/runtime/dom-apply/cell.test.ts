// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { determineCellTypeFromDOM, isTechnicalCell } from './cell';

function createCell(innerHtml: string, tagName = 'td') {
  const cell = document.createElement(tagName);
  cell.innerHTML = innerHtml;
  return cell;
}

describe('ai-pick dom-apply cell helpers', () => {
  it('detects status, image, link, number, boolean, and plain string cells', () => {
    expect(determineCellTypeFromDOM(createCell('<span class="colorCircle"></span>Статус'))).toBe(
      'status'
    );
    expect(determineCellTypeFromDOM(createCell('<img src="/avatar.png" alt="" />'))).toBe('image');
    expect(determineCellTypeFromDOM(createCell('<a href="#link">123</a>'))).toBe('link');
    expect(determineCellTypeFromDOM(createCell('42'))).toBe('number');
    expect(determineCellTypeFromDOM(createCell('Да'))).toBe('boolean');
    expect(determineCellTypeFromDOM(createCell('Обычное значение'))).toBe('string');
  });

  it('detects technical checkbox, icon-only, empty, and data cells', () => {
    expect(isTechnicalCell(createCell('<input type="checkbox" checked />'))).toEqual({
      isTechnical: true,
      type: 'select-box',
    });
    expect(isTechnicalCell(createCell('<img src="/icon.png" alt="" />'))).toEqual({
      isTechnical: true,
      type: 'icon',
    });
    expect(isTechnicalCell(createCell('   '))).toEqual({
      isTechnical: true,
      type: 'empty',
    });
    expect(isTechnicalCell(createCell('<a href="#row">Открыть</a>'))).toEqual({
      isTechnical: false,
      type: 'data',
    });
  });
});
