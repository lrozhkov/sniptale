import { expectTypeOf, it } from 'vitest';
import type { GalleryAppState as SourceGalleryAppState } from '../../state/types';
import type {
  FolderFilter,
  GalleryAppState,
  GalleryAppStateController,
  GalleryCommandPaletteController,
  GalleryViewMode,
  SortMode,
} from './types';

it('keeps the shell app contract aligned with the gallery state owner', () => {
  expectTypeOf<GalleryAppState>().toEqualTypeOf<SourceGalleryAppState>();
  expectTypeOf<FolderFilter>().not.toEqualTypeOf<GalleryViewMode>();
  expectTypeOf<SortMode>().not.toEqualTypeOf<GalleryViewMode>();
  expectTypeOf<GalleryAppStateController>().toEqualTypeOf<GalleryCommandPaletteController>();
});
