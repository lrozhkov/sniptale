import { expect, it } from 'vitest';

import { runCompositeRenderLoop as runCompositeRenderLoopFacade } from './index';
import { runCompositeRenderLoop as runCompositeRenderLoopImpl } from './loop';

it('keeps the run facade aligned with the loop implementation', () => {
  expect(runCompositeRenderLoopFacade).toBe(runCompositeRenderLoopImpl);
});
