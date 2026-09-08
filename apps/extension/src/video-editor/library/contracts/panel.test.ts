import { expectTypeOf, it } from 'vitest';
import type { VideoEditorLibraryPanelProps } from './panel';
it('awaits media insertion before reporting success', () => {
  expectTypeOf<VideoEditorLibraryPanelProps['onAddMedia']>().toEqualTypeOf<
    (mediaId: string) => Promise<void>
  >();
});
