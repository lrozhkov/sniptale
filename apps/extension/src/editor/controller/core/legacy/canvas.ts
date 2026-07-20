import type { Canvas, Group } from 'fabric';
import { isGroup } from '../helpers';
import { createLegacyArrowReplacement } from './replacement';

export function upgradeLegacyArrowObjects(canvas: Canvas | null): void {
  if (!canvas) {
    return;
  }

  const legacyArrows = canvas
    .getObjects()
    .filter((object): object is Group => isGroup(object) && object.sniptaleType === 'arrow');
  legacyArrows.forEach((legacyArrow) => {
    const replacement = createLegacyArrowReplacement(legacyArrow);
    if (!replacement) {
      return;
    }

    const index = canvas.getObjects().indexOf(legacyArrow);
    canvas.remove(legacyArrow);
    canvas.add(replacement);
    if (index >= 0) {
      canvas.moveObjectTo(replacement, index);
    }
  });
}
