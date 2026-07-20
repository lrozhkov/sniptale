import { expect, it } from 'vitest';

import {
  determineCellTypeFromDOM as canonicalDetermineCellTypeFromDOM,
  isTechnicalCell as canonicalIsTechnicalCell,
} from './cell';
import {
  determineCellTypeFromDOM as facadeDetermineCellTypeFromDOM,
  isTechnicalCell as facadeIsTechnicalCell,
} from './cell';

it('keeps the cell helper root as a thin facade', () => {
  expect(facadeDetermineCellTypeFromDOM).toBe(canonicalDetermineCellTypeFromDOM);
  expect(facadeIsTechnicalCell).toBe(canonicalIsTechnicalCell);
});
