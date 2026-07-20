import { expect, it } from 'vitest';
import { isTargetInCurrentSelection } from './target';

function createObject(id?: string) {
  return id === undefined ? ({ id: crypto.randomUUID() } as never) : ({ sniptaleId: id } as never);
}

it('matches active targets by identity or stable editor object id', () => {
  const activeObject = createObject('active');
  const groupedObject = createObject('grouped');
  const matchingObject = createObject('grouped');
  const canvas = {
    getActiveObject: () => activeObject,
    getActiveObjects: () => [groupedObject],
  };

  expect(isTargetInCurrentSelection(canvas, activeObject)).toBe(true);
  expect(isTargetInCurrentSelection(canvas, matchingObject)).toBe(true);
  expect(isTargetInCurrentSelection(canvas, createObject('other'))).toBe(false);
  expect(isTargetInCurrentSelection(canvas, null)).toBe(false);
});
