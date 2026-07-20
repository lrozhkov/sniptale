import { expect, it } from 'vitest';

import { renderFrameDrivenCompositeFrame as renderFrameDrivenCompositeFrameRoot } from './index';
import { renderFrameDrivenCompositeFrame } from './frame';

it('keeps the frame-driven render facade aligned', () => {
  expect(renderFrameDrivenCompositeFrameRoot).toBe(renderFrameDrivenCompositeFrame);
});
