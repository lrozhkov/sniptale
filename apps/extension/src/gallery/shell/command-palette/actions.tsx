import {
  Boxes,
  Download,
  Eye,
  FileStack,
  FolderArchive,
  Image,
  Images,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  commandPaletteIcon,
  createCommandPaletteRunAction,
  createCommandPaletteToggleAction,
  getCommandPaletteDisabledContextReason,
} from '../../../ui/command-palette/action-builders';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import { SIDEBAR_FOLDERS } from '../app/constants';
import type { GalleryCommandPaletteController, SortMode } from '../app/types';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import { FOLDER_LABELS, getKindIcon } from '../../library/ui';

const sortModeIcons: Record<SortMode, typeof Search> = {
  newest: Search,
  oldest: Search,
  size: Boxes,
};

function buildGalleryFolderFilterActions(
  controller: GalleryCommandPaletteController
): CommandPaletteAction[] {
  return SIDEBAR_FOLDERS.map((folder) => {
    const icon = folder === 'all' ? commandPaletteIcon(Images) : buildGalleryFolderIcon(folder);

    return createCommandPaletteToggleAction({
      id: `gallery-filter-folder-${folder}`,
      title: FOLDER_LABELS[folder],
      section: translate('shared.ui.commandPaletteFiltersSection'),
      icon,
      active: controller.state.filters.folderFilter === folder,
      onSelect: () => controller.actions.filters.setFolderFilter(folder),
    });
  });
}

function buildGalleryFolderIcon(folder: Exclude<(typeof SIDEBAR_FOLDERS)[number], 'all'>) {
  if (folder === 'scenario' || folder === 'web-snapshot') {
    return commandPaletteIcon(FileStack);
  }

  const Icon = getKindIcon(folder);
  return commandPaletteIcon(Icon);
}

function buildGallerySortActions(
  controller: GalleryCommandPaletteController
): CommandPaletteAction[] {
  const sortModes: SortMode[] = ['newest', 'oldest', 'size'];

  return sortModes.map((sortMode) => {
    const Icon = sortModeIcons[sortMode];
    const title =
      sortMode === 'newest'
        ? translate('gallery.app.sortNewest')
        : sortMode === 'oldest'
          ? translate('gallery.app.sortOldest')
          : controller.state.filters.folderFilter === 'scenario'
            ? translate('gallery.app.sortName')
            : translate('gallery.app.sortSize');

    return createCommandPaletteToggleAction({
      id: `gallery-filter-sort-${sortMode}`,
      title,
      section: translate('shared.ui.commandPaletteFiltersSection'),
      icon: commandPaletteIcon(Icon),
      active: controller.state.filters.sortMode === sortMode,
      onSelect: () => controller.actions.filters.setSortMode(sortMode),
    });
  });
}

function buildGalleryPrimaryActions(
  controller: GalleryCommandPaletteController,
  actions: UseGalleryAppActionsResult,
  onRefresh: (() => void) | undefined
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'gallery-refresh',
      title: translate('gallery.app.refresh'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(RefreshCw),
      onSelect: () => {
        if (onRefresh) {
          onRefresh();
          return;
        }

        void controller.actions.storage.refresh();
      },
    }),
    createCommandPaletteRunAction({
      id: 'gallery-open-storage-manager',
      title: translate('gallery.app.openStorageManager'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(ShieldAlert),
      onSelect: () => controller.actions.surface.setShowStorageManager(true),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-export-backup',
      title: translate('gallery.app.exportBackup'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(FolderArchive),
      onSelect: () => actions.backup.exportBackup(),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-import-backup',
      title: translate('gallery.app.importBackup'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Upload),
      onSelect: () => controller.refs.importInputRef.current?.click(),
    }),
  ];
}

function buildGallerySelectionActions(
  controller: Pick<GalleryCommandPaletteController, 'actions' | 'state'>,
  actions: UseGalleryAppActionsResult
): CommandPaletteAction[] {
  const hasSelection = controller.state.selection.selectedItems.length > 0;
  const disabledReason = getCommandPaletteDisabledContextReason();

  return [
    createCommandPaletteRunAction({
      id: 'gallery-selection-clear',
      title: translate('gallery.app.clearSelection'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Trash2),
      disabled: !hasSelection,
      disabledReason: !hasSelection ? disabledReason : undefined,
      onSelect: () => controller.actions.selection.setSelectedIds(new Set()),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-selection-download-zip',
      title: translate('gallery.preview.downloadZip'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Download),
      disabled: !hasSelection,
      disabledReason: !hasSelection ? disabledReason : undefined,
      onSelect: () => actions.selection.downloadZip(),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-selection-delete',
      title: translate('common.actions.delete'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Trash2),
      disabled: !hasSelection,
      disabledReason: !hasSelection ? disabledReason : undefined,
      onSelect: () => actions.selection.deleteMany(controller.state.selection.selectedItems),
    }),
  ];
}

function buildGalleryPreviewActions(
  controller: Pick<GalleryCommandPaletteController, 'state'>,
  actions: UseGalleryAppActionsResult
): CommandPaletteAction[] {
  const previewItem = controller.state.preview.session.item;
  const disabledReason = getCommandPaletteDisabledContextReason();
  const projectUnavailable =
    previewItem?.type === 'video-project' && previewItem.unavailableReason !== null;

  return [
    createCommandPaletteRunAction({
      id: 'gallery-preview-download',
      title: translate('gallery.preview.download'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Download),
      disabled: !previewItem,
      disabledReason: !previewItem ? disabledReason : undefined,
      onSelect: () => actions.preview.download(),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-preview-copy',
      title: translate('gallery.preview.copy'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Image),
      disabled: !previewItem,
      disabledReason: !previewItem ? disabledReason : undefined,
      onSelect: () => actions.preview.copy(),
    }),
    createCommandPaletteRunAction({
      id: 'gallery-preview-open-editor',
      title: translate('gallery.preview.openInEditor'),
      section: translate('shared.ui.commandPaletteActionsSection'),
      icon: commandPaletteIcon(Eye),
      disabled: !previewItem || projectUnavailable,
      disabledReason: !previewItem || projectUnavailable ? disabledReason : undefined,
      onSelect: () => {
        if (previewItem) {
          actions.preview.openInEditor(previewItem);
        }
      },
    }),
  ];
}

export function buildGalleryCommandPaletteActions(
  controller: GalleryCommandPaletteController,
  actions: UseGalleryAppActionsResult,
  onRefresh?: () => void
): CommandPaletteAction[] {
  return [
    ...buildGalleryFolderFilterActions(controller),
    ...buildGallerySortActions(controller),
    ...buildGalleryPrimaryActions(controller, actions, onRefresh),
    ...buildGallerySelectionActions(controller, actions),
    ...buildGalleryPreviewActions(controller, actions),
  ];
}
