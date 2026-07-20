import { describe, expect, it } from 'vitest';
import { VideoActiveIdleState } from './idle-state';

describe('video active idle state', () => {
  it('exports the idle state component', () => {
    expect(VideoActiveIdleState).toBeTypeOf('function');
  });
});
