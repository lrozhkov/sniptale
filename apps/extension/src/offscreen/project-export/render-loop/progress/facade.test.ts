import { expect, it } from 'vitest';

import { sendCompositeRenderProgress, sendFrameDrivenProgress } from './index';
import { sendCompositeRenderProgress as sendCompositeRenderProgressImpl } from './composite';
import { sendFrameDrivenProgress as sendFrameDrivenProgressImpl } from './frame-driven';

it('keeps the render-loop progress facade as a thin stable forwarding layer', () => {
  expect(sendCompositeRenderProgress).toBe(sendCompositeRenderProgressImpl);
  expect(sendFrameDrivenProgress).toBe(sendFrameDrivenProgressImpl);
});
