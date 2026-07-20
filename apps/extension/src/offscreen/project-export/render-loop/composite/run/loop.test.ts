import { expect, it } from 'vitest';

import { runCompositeRenderLoop as runCompositeRenderLoopFacade } from './loop';
import { runCompositeRenderLoop as runCompositeRenderLoopImpl } from './orchestrate';

it('keeps the loop facade aligned with the orchestration implementation', () => {
  expect(runCompositeRenderLoopFacade).toBe(runCompositeRenderLoopImpl);
});
