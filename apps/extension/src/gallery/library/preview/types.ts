import type { GalleryItem } from '../items';

interface PreviewNavigationProps {
  current: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export interface PreviewPanelProps {
  allTags?: string[];
  hasChanges?: boolean;
  item: GalleryItem;
  previewUrl: string | null;
  inspectorCollapsed: boolean;
  filenameDraft: string;
  tagDraft: string;
  tagDrafts: string[];
  navigation?: PreviewNavigationProps;
  onClose: () => void;
  onInspectorToggle: () => void;
  onFilenameChange: (value: string) => void;
  onTagDraftChange: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: (tag?: string) => void;
  onResetChanges?: () => void;
  onSave?: () => Promise<void>;
  onDownload: () => Promise<void>;
  onDownloadOriginal?: () => Promise<void>;
  onCopy: () => Promise<void>;
  onEdit: () => void;
  onOpenSnapshotScreenshot?: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPromote?: () => Promise<void>;
  onRestoreOriginal?: () => void;
  onSaveCopy?: () => Promise<void>;
}
