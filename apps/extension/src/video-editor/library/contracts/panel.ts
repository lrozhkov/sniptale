import type { GallerySavedView } from '../../../composition/persistence/gallery-saved-views/contract';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';

export interface VideoEditorLibraryPanelProps {
  isOpen: boolean;
  items: MediaLibraryItem[];
  savedViews: GallerySavedView[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onAddMedia: (mediaId: string) => Promise<void>;
  onClose: () => void;
}

export type VideoEditorLibraryPanelBodyProps = Omit<VideoEditorLibraryPanelProps, 'isOpen'>;
