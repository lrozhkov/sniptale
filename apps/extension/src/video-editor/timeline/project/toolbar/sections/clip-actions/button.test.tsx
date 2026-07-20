import { describe, expect, it } from 'vitest';

import { ProjectTimelineToolbarActionButton } from './button';

describe('ProjectTimelineToolbarActionButton', () => {
  it('remains available as the shared action primitive', () => {
    expect(ProjectTimelineToolbarActionButton).toBeTypeOf('function');
  });
});
