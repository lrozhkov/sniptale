import { expect, it } from 'vitest';

import { createMp4Pipeline } from './index';
import { createMp4Pipeline as createMp4PipelineImpl } from './build';

it('keeps the render-mp4 create facade thin', () => {
  expect(createMp4Pipeline).toBe(createMp4PipelineImpl);
});
