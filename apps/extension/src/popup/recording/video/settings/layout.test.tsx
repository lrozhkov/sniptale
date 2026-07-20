import { describe, expect, it } from 'vitest';
import { VideoSettingsGrid } from './layout';

describe('video settings layout', () => {
  it('exports the settings grid component', () => {
    expect(VideoSettingsGrid).toBeTypeOf('function');
  });
});
