import { expect, it } from 'vitest';
import { areBrowserFrameAnnotationsEqual as facadeEquality } from '.';
import { areBrowserFrameAnnotationsEqual as leafEquality } from './frame-equality';

it('re-exports the exact frame annotation equality operation', () => {
  expect(facadeEquality).toBe(leafEquality);
});
