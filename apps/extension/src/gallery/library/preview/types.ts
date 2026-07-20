import type { GalleryItem } from '../items';

export interface PreviewPanelProps {
  allTags?: string[];
  hasChanges?: boolean;
  item: GalleryItem;
  previewUrl: string | null;
  inspectorCollapsed: boolean;
  filenameDraft: string;
  tagDraft: string;
  tagDrafts: string[];
  onClose: () => void;
  onInspectorToggle: () => void;
  onFilenameChange: (value: string) => void;
  onTagDraftChange: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  onAddTag: () => void;
  onResetChanges?: () => void;
  onSave?: () => Promise<void>;
  onDownload: () => Promise<void>;
  onCopy: () => Promise<void>;
  onEdit: () => void;
  onOpenSnapshotScreenshot?: () => Promise<void>;
  onDelete: () => Promise<void>;
}
