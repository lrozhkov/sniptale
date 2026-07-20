// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { VideoSettingsGrid } from './index';

describe('video settings facade', () => {
  it('re-exports the settings grid owner module', () => {
    expect(VideoSettingsGrid).toBeTypeOf('function');
  });
});
