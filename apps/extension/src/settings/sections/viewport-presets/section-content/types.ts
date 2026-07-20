import type { ViewportPreset } from '../../../../contracts/settings';

export type PresetsSectionContentProps = {
  closeViewportDeleteDialog: () => void;
  closeViewportEditor: () => void;
  confirmDeleteViewport: () => Promise<void>;
  defaultViewportId: string;
  deleteMessage: string;
  editingViewport?: ViewportPreset;
  handleAddViewportPreset: () => void;
  handleDefaultViewportChange: (id: string) => Promise<void>;
  handleDeleteViewportPreset: (preset: ViewportPreset) => void;
  handleEditViewportPreset: (preset: ViewportPreset) => void;
  handleSaveViewportPreset: (label: string, width: number, height: number) => Promise<void>;
  hoveredViewportId: string | null;
  isLoading: boolean;
  isViewportEditorOpen: boolean;
  presetsCountLabel: string;
  setHoveredViewportId: (id: string | null) => void;
  viewportConfirmOpen: boolean;
  viewportPresets: ViewportPreset[];
};
