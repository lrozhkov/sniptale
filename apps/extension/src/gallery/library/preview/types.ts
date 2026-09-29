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
  initialMode?: 'edit';
  trashMode?: boolean;
  onRestoreTrash?: () => Promise<boolean>;
  restoreBusy?: boolean;
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
  onDownload: () => Promise<boolean | void>;
  onDownloadOriginal?: () => Promise<boolean | void>;
  onCopy: () => Promise<boolean | void>;
  onEdit: () => void;
  onOpenSnapshotScreenshot?: () => Promise<void>;
  onDelete: () => Promise<void>;
  onPromote?: () => Promise<void>;
  onRestoreOriginal?: () => void;
  onSaveCopy?: () => Promise<boolean | void>;
}
