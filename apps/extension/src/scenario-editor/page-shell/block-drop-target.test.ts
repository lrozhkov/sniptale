// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { guideBlockDropTarget } from './block-drop-target';
const host = document.createElement('div');
host.dataset['reorderStep'] = 'step';
afterEach(() => {
  host.replaceChildren();
  vi.restoreAllMocks();
});
function block(id: string, x: number, y: number, width: number, percent: number, height = 100) {
  const node = document.createElement('div');
  node.className = 'guide-block';
  node.dataset['blockId'] = id;
  node.dataset['width'] = String(percent);
  host.append(node);
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, width, height));
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 400));
  return node;
}
it('offers an adjacent split with both final footprints and a new row near the upper edge', () => {
  block('a', 0, 0, 500, 50);
  block('b', 500, 0, 500, 50, 200);
  const side = guideBlockDropTarget(host, 'external', 10, 60, 100);
  expect(side).toMatchObject({
    placement: 'before',
    anchorBlockId: 'a',
    width: 25,
    preview: { left: 0, width: 250 },
    neighbor: { left: 250, width: 250, percent: 25 },
  });
  expect(guideBlockDropTarget(host, 'external', 10, 5, 100)).toMatchObject({
    placement: 'row-before',
    anchorBlockId: 'a',
    preview: { width: 1000, height: 4 },
  });
});
it('uses remaining row space and keeps tall blocks in their original row', () => {
  block('a', 0, 0, 300, 30, 180);
  block('b', 300, 0, 300, 30);
  expect(guideBlockDropTarget(host, 'external', 800, 100, 40)).toMatchObject({
    placement: 'row-end',
    width: 40,
    preview: { left: 600, width: 400, height: 180 },
  });
});
it('normalizes both sides of a row gap to one insertion and rejects an adjacent no-op', () => {
  block('source', 0, 0, 1000, 100);
  block('b', 0, 120, 1000, 100);
  block('c', 0, 240, 1000, 100);
  expect(guideBlockDropTarget(host, 'source', 20, 130, 100)).toBeNull();
  const above = guideBlockDropTarget(host, 'source', 20, 218, 100);
  const below = guideBlockDropTarget(host, 'source', 20, 242, 100);
  expect(above?.placement).toBe('row-before');
  expect(above?.anchorBlockId).toBe('c');
  expect(below?.anchorBlockId).toBe('c');
  expect(above?.preview).toEqual(below?.preview);
});
it('does not offer impossible side placement in a five-column row', () => {
  for (let i = 0; i < 5; i++) block(String(i), i * 200, 0, 200, 20);
  expect(guideBlockDropTarget(host, 'external', 450, 50, 20)).toBeNull();
  expect(guideBlockDropTarget(host, 'external', 450, 1, 20)?.placement).toBe('row-before');
});

it('does not offer an unchanged position within an existing row', () => {
  block('a', 0, 0, 500, 50);
  block('b', 500, 0, 500, 50);
  expect(guideBlockDropTarget(host, 'a', 510, 50, 50)).toBeNull();
  expect(guideBlockDropTarget(host, 'a', 990, 50, 50)?.placement).toBe('after');
});
