import type { ReactNode } from 'react';
import { Bug, ChevronRight, FileAudio2, FilePlus2, Film, ImagePlus } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { cx, getDiagnosticsToggleTitle } from './helpers';
import {
  SIDEBAR_BUTTON_ACCENT_CLASS_NAME,
  SIDEBAR_BUTTON_ACCENT_HOVER_CLASS_NAME,
  SIDEBAR_BUTTON_ACCENT_TEXT_CLASS_NAME,
  SIDEBAR_BUTTON_BASE_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_HOVER_CLASS_NAME,
  SIDEBAR_BUTTON_NEUTRAL_TEXT_CLASS_NAME,
} from './sections';

const SIDEBAR_BUTTON_LAYOUT_CLASS_NAME =
  'inline-flex h-10 w-10 items-center justify-center rounded-[10px]';

export { ActionButton, CollapsibleSection, CollapsedSelectionCard } from './sections';

function SidebarIconButton({
  title,
  icon,
  onClick,
  accent = false,
  active = false,
}: {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  accent?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cx(
        SIDEBAR_BUTTON_LAYOUT_CLASS_NAME,
        SIDEBAR_BUTTON_BASE_CLASS_NAME,
        accent || active
          ? cx(
              SIDEBAR_BUTTON_ACCENT_CLASS_NAME,
              SIDEBAR_BUTTON_ACCENT_TEXT_CLASS_NAME,
              SIDEBAR_BUTTON_ACCENT_HOVER_CLASS_NAME
            )
          : cx(
              SIDEBAR_BUTTON_NEUTRAL_CLASS_NAME,
              SIDEBAR_BUTTON_NEUTRAL_TEXT_CLASS_NAME,
              SIDEBAR_BUTTON_NEUTRAL_HOVER_CLASS_NAME
            )
      )}
    >
      {icon}
    </button>
  );
}

export function renderCollapsedRailButtons(props: {
  diagnosticsOpen: boolean;
  onToggleCollapsed: () => void;
  onCreateProject: () => void | Promise<void>;
  onImportImage: () => void;
  onImportVideo: () => void;
  onImportAudio: () => void;
  onToggleDiagnostics: () => void;
}) {
  return (
    <>
      <SidebarIconButton
        title={translate('videoEditor.sidebar.expandInspector')}
        onClick={props.onToggleCollapsed}
        icon={<ChevronRight size={18} strokeWidth={2.2} />}
      />
      <SidebarIconButton
        title={translate('videoEditor.sidebar.newProject')}
        onClick={() => void props.onCreateProject()}
        icon={<FilePlus2 size={17} strokeWidth={2.2} />}
        accent
      />
      <SidebarIconButton
        title={translate('videoEditor.sidebar.importImage')}
        onClick={props.onImportImage}
        icon={<ImagePlus size={17} strokeWidth={2} />}
      />
      <SidebarIconButton
        title={translate('videoEditor.sidebar.importVideo')}
        onClick={props.onImportVideo}
        icon={<Film size={17} strokeWidth={2} />}
      />
      <SidebarIconButton
        title={translate('videoEditor.sidebar.importAudio')}
        onClick={props.onImportAudio}
        icon={<FileAudio2 size={17} strokeWidth={2} />}
      />
      <SidebarIconButton
        title={getDiagnosticsToggleTitle(props.diagnosticsOpen)}
        onClick={props.onToggleDiagnostics}
        icon={<Bug size={17} strokeWidth={2} />}
        active={props.diagnosticsOpen}
      />
    </>
  );
}
