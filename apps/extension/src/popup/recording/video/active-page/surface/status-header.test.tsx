import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../../copy', (_importOriginal) => ({
  getRecordingStatusLabel: (status: string) => `status:${status}`,
}));

import { VideoActiveStatusHeader } from './status-header';

describe('video active status header', () => {
  it('exports the status header component', () => {
    expect(VideoActiveStatusHeader).toBeTypeOf('function');
  });
});
