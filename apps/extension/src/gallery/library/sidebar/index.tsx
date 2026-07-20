import type { GallerySidebarProps } from './types';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import {
  GalleryBackupActions,
  GalleryFolderList,
  GalleryStorageCard,
  GalleryTagsCard,
} from './sections';

const gallerySidebarPanelClassName = [
  'px-4 py-5 shadow-[inset_-1px_0_0_color-mix(in_srgb,var(--sniptale-color-border-strong)_72%,transparent)]',
  [
    'bg-[linear-gradient(',
    '180deg,',
    'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)_0%,',
    'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_80%,transparent)_100%',
    ')]',
  ].join(' '),
].join(' ');

export function GallerySidebar(props: GallerySidebarProps) {
  return (
    <InspectorShellFrame
      expandedWidthClassName={INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS}
      dataUi="gallery.sidebar.shell"
    >
      <InspectorShellPanel dataUi="gallery.sidebar.panel" className={gallerySidebarPanelClassName}>
        <GalleryFolderList {...props} />
        <GalleryStorageCard {...props} />
        <GalleryTagsCard {...props} />
        <GalleryBackupActions {...props} />
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}
