// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import { applyDomMutationBatch, captureDomStateMap, createDomMutationBatch } from './dom';

afterEach(() => document.body.replaceChildren());

function createPositionedText(): HTMLParagraphElement {
  const target = document.createElement('p');
  target.textContent = 'Original';
  target.style.cssText = [
    'position: absolute;',
    'left: 620px;',
    'top: 170px;',
    'width: 180px;',
    'color: red;',
    '--page-color: teal;',
    'background-image: url("https://example.com/existing.png");',
  ].join(' ');
  document.body.append(target);
  return target;
}

it('preserves unmodified live source styles during text-only replay in both directions', () => {
  const target = createPositionedText();
  const originalStyle = target.getAttribute('style');
  const before = captureDomStateMap([target]);
  target.textContent = 'Changed';
  const batch = createDomMutationBatch([target], before);
  expect(applyDomMutationBatch(batch, 'undo').success).toBe(true);
  expect(target.textContent).toBe('Original');
  expect(target.getAttribute('style')).toBe(originalStyle);
  expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
  expect(target.textContent).toBe('Changed');
  expect(target.getAttribute('style')).toBe(originalStyle);
});

it('still removes live handlers and unsafe URLs when preserving unchanged live styles', () => {
  const target = createPositionedText();
  target.setAttribute('onclick', 'alert(1)');
  target.setAttribute('href', 'javascript:alert(1)');
  const batch = createDomMutationBatch([target]);
  expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
  expect(target.getAttribute('onclick')).toBeNull();
  expect(target.getAttribute('href')).toBeNull();
  expect(target.style.position).toBe('absolute');
  expect(target.style.left).toBe('620px');
});

it('never preserves a forged incoming style that normalizes to the current projection', () => {
  const target = createPositionedText();
  const batch = createDomMutationBatch([target]);
  const after = batch.patches[0]?.after;
  if (!after) throw new Error('Expected mutation patch');
  after.attributes['style'] = `${after.attributes['style']} position: fixed;`;
  expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
  expect(target.style.position).toBe('');
  expect(target.style.left).toBe('');
  expect(target.style.backgroundImage).toBe('');
  expect(target.style.color).toBe('red');
});

it('does not preserve source styles when a supported declaration actually changes', () => {
  const target = createPositionedText();
  const batch = createDomMutationBatch([target]);
  const after = batch.patches[0]?.after;
  if (!after) throw new Error('Expected mutation patch');
  after.attributes['style'] = 'color: blue;';
  expect(applyDomMutationBatch(batch, 'redo').success).toBe(true);
  expect(target.style.color).toBe('blue');
  expect(target.style.position).toBe('');
});
