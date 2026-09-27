import { Magnet, Map, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { EditorViewportPreview } from '../viewport-preview';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import type { EditorFloatingDocumentController } from './document-bar';
import { CompactWorkspacePopoverContent } from './view-controls-popovers';

const VIEW_POPOVER_CLASS_NAME = floatingChromeClassNames(
  'absolute right-0 top-[calc(100%+0.375rem)] z-50',
  'w-[min(22rem,calc(100vw-1.5rem-var(--editor-floating-edge-right,0px)))]',
  'overflow-visible !rounded-none p-3'
);

const VIEW_MAP_POPOVER_CLASS_NAME = floatingChromeClassNames(
  'absolute right-0 top-[calc(100%+0.375rem)] z-50',
  'w-[var(--editor-view-toolbar-width,min(18rem,calc(100vw-1.5rem)))] !rounded-none p-3'
);

export type ViewPopoverId = 'workspace' | 'map';

function ViewToolbarPopoverAnchor(props: {
  active: boolean;
  disabled?: boolean;
  id: ViewPopoverId;
  open: boolean;
  popover: ReactNode;
  title: string;
  trigger: ReactNode;
  variant?: 'default' | 'map';
  onToggle: (id: ViewPopoverId) => void;
}) {
  return (
    <div className="contents">
      <ContentToolbarButton
        title={props.title}
        active={props.active}
        disabled={props.disabled}
        onClick={() => props.onToggle(props.id)}
        dataUi={`editor.floating.view-controls.${props.id}`}
      >
        {props.trigger}
      </ContentToolbarButton>
      {props.open ? (
        <FloatingChromePanel
          dataUi={`editor.floating.view-controls.popover.${props.id}`}
          className={
            props.variant === 'map' ? VIEW_MAP_POPOVER_CLASS_NAME : VIEW_POPOVER_CLASS_NAME
          }
        >
          {props.popover}
        </FloatingChromePanel>
      ) : null}
    </div>
  );
}

function WorkspacePopoverButton(props: {
  activePopover: ViewPopoverId | null;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
  onToggle: (id: ViewPopoverId) => void;
}) {
  return (
    <ViewToolbarPopoverAnchor
      id="workspace"
      title={getDocumentRequiredTitle(translate('editor.toolbar.viewSettings'), props.hasImage)}
      active={props.activePopover === 'workspace'}
      open={props.activePopover === 'workspace'}
      disabled={!props.hasImage}
      trigger={<SlidersHorizontal size={15} strokeWidth={2} />}
      onToggle={props.onToggle}
      popover={<CompactWorkspacePopoverContent {...props} />}
    />
  );
}

function MapPopoverButton(props: {
  activePopover: ViewPopoverId | null;
  hasImage: boolean;
  mapWidth: number;
  onToggle: (id: ViewPopoverId) => void;
}) {
  return (
    <ViewToolbarPopoverAnchor
      id="map"
      title={getDocumentRequiredTitle(
        translate('editor.toolbar.viewportNavigation'),
        props.hasImage
      )}
      active={props.activePopover === 'map'}
      open={props.activePopover === 'map'}
      disabled={!props.hasImage}
      trigger={<Map size={15} strokeWidth={2} />}
      variant="map"
      onToggle={props.onToggle}
      popover={
        <EditorViewportPreview
          hasImage={props.hasImage}
          forceOpen
          maxWidth={Math.max(112, props.mapWidth - 24)}
          variant="embedded"
        />
      }
    />
  );
}

export function ViewSettingsControls(props: {
  activePopover: ViewPopoverId | null;
  documentController: EditorFloatingDocumentController;
  gridEnabled: boolean;
  hasImage: boolean;
  mapWidth: number;
  magnetEnabled: boolean;
  onToggle: (id: ViewPopoverId) => void;
  onToggleMagnet: () => void;
}) {
  return (
    <ContentToolbarGroup className="gap-1.5" dataUi="editor.floating.view-controls.settings-group">
      <WorkspacePopoverButton {...props} />
      <ContentToolbarButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.magnetMode'), props.hasImage)}
        active={props.magnetEnabled}
        disabled={!props.hasImage}
        onClick={props.onToggleMagnet}
        dataUi="editor.floating.view-controls.magnet"
      >
        <Magnet size={15} strokeWidth={2} />
      </ContentToolbarButton>
      <MapPopoverButton {...props} />
    </ContentToolbarGroup>
  );
}
