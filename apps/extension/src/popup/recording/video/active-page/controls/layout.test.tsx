import { describe, expect, it } from 'vitest';
import { VideoActiveControls } from './layout';

describe('video active page controls layout', () => {
  it('exports the layout component', () => {
    expect(VideoActiveControls).toBeTypeOf('function');
  });
});
