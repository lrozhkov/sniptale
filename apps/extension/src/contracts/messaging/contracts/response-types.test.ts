import { expect, it } from 'vitest';

import { recordingStateHealthValues } from './response-types';

it('keeps recording state health values stable for runtime contracts', () => {
  expect(recordingStateHealthValues).toEqual(['healthy', 'degraded', 'failed']);
});
