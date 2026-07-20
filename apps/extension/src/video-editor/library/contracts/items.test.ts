import { describe, expectTypeOf, it } from 'vitest';

import type { ProjectListItem, RecordingListItem } from './items';

describe('video editor library item contracts', () => {
  it('keeps project and recording list items owned by the library contract seam', () => {
    expectTypeOf<ProjectListItem>().toMatchTypeOf<{
      clipCount: number;
      duration: number;
      id: string;
      name: string;
      updatedAt: number;
    }>();
    expectTypeOf<RecordingListItem>().toMatchTypeOf<{
      duration: number | null;
      filename: string;
      id: string;
      mimeType: string;
      size: number;
    }>();
  });
});
