import { describe, expect, it } from 'vitest';
import { VideoActiveError } from './error';

describe('video active error', () => {
  it('exports the error component', () => {
    expect(VideoActiveError).toBeTypeOf('function');
  });
});
