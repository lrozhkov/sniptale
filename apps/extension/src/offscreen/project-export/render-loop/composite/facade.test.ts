import { expect, it } from 'vitest';

import { runCompositeRenderLoop } from './index';
import { runCompositeRenderLoop as runCompositeRenderLoopImpl } from './run/index';

it('keeps the composite render-loop facade as a thin stable forwarding layer', () => {
  expect(runCompositeRenderLoop).toBe(runCompositeRenderLoopImpl);
});
