import { describe, expect, it } from 'vitest';
import { VideoActiveStopControl } from './stop-control';

describe('video active stop control', () => {
  it('exports the stop control component', () => {
    expect(VideoActiveStopControl).toBeTypeOf('function');
  });
});
