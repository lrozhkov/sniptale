import type { GallerySidebarProps } from './types';
import {
  InspectorShellFrame,
  InspectorShellPanel,
  INSPECTOR_SHELL_EXPANDED_WIDTH_CLASS,
} from '@sniptale/ui/inspector-shell';
import { GalleryFacetFilters, GalleryFolderList } from './sections';

const gallerySidebarPanelClassName = [
  [
    'overflow-y-auto overscroll-contain rounded-[var(--sniptale-radius-lg)] border',
    'border-[var(--sniptale-color-border-soft)] p-3 shadow-sm',
  ].join(' '),
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
      className="overflow-hidden border-r-0 bg-transparent"
      dataUi="gallery.sidebar.shell"
    >
      <InspectorShellPanel dataUi="gallery.sidebar.panel" className={gallerySidebarPanelClassName}>
        <GalleryFolderList {...props} />
        <GalleryFacetFilters {...props} />
      </InspectorShellPanel>
    </InspectorShellFrame>
  );
}
