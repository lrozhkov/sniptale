import React from 'react';
import {
  Camera,
  Keyboard,
  Film,
  ImageIcon,
  MousePointer2,
  CircleDot,
  Palette,
  Search,
  SlidersHorizontal,
  Sparkles,
  Type,
  Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { translate, type TranslationKey } from '../../../platform/i18n';
import {
  isAudioClip,
  isAnnotationClip,
  isShapeClip,
  isSubtitleClip,
  isTextClip,
  isVideoClip,
} from '../../../features/video/project/timeline';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';
import type { WorkspaceSidebarPanelContentSharedProps } from './contracts/panel-content';
import type { WorkspaceSidebarProps } from './contracts/props';
import { getClipTypeLabel } from '../../chrome/display';
import { VideoProjectTrackRole, VideoTrackKind } from '../../../features/video/project/types';

interface WorkspaceSidebarPanelContentProps extends WorkspaceSidebarPanelContentSharedProps {
  selectionTitle: string;
  selectionIcon: React.ReactNode;
}

const SIDEBAR_ICON_PROPS = { size: 18, strokeWidth: 2 } as const;

function renderSidebarIcon(Icon: LucideIcon): React.ReactNode {
  return <Icon {...SIDEBAR_ICON_PROPS} />;
}

function getClipSelectionIcon(clip: WorkspaceSidebarProps['selectedClip']): React.ReactNode {
  if (!clip) {
    return renderSidebarIcon(ImageIcon);
  }
  if (isAudioClip(clip)) {
    return renderSidebarIcon(Volume2);
  }
  if (isVideoClip(clip)) {
    return renderSidebarIcon(Film);
  }
  if (isTextClip(clip)) {
    return renderSidebarIcon(Type);
  }
  if (isAnnotationClip(clip)) {
    return renderSidebarIcon(Sparkles);
  }
  if (isSubtitleClip(clip)) {
    return renderSidebarIcon(Type);
  }
  if (isShapeClip(clip)) {
    return renderSidebarIcon(Palette);
  }
  return renderSidebarIcon(ImageIcon);
}

function createStaticSelectionMeta(Icon: LucideIcon, labelKey: TranslationKey) {
  const label = translate(labelKey);
  return {
    icon: renderSidebarIcon(Icon),
    label,
    title: label,
  };
}

export function getSelectionMeta(
  selection: VideoEditorSelection,
  clip: WorkspaceSidebarProps['selectedClip'],
  selectedTrack?: WorkspaceSidebarProps['selectedTrack']
): { icon: React.ReactNode; label: string; title: string } {
  switch (selection.kind) {
    case VideoEditorSelectionKind.SCENE:
      return createStaticSelectionMeta(SlidersHorizontal, 'videoEditor.sidebar.sceneProperties');
    case VideoEditorSelectionKind.CLIP:
      return {
        icon: getClipSelectionIcon(clip),
        label: getClipTypeLabel(clip),
        title: clip?.name ?? translate('videoEditor.sidebar.sceneProperties'),
      };
    case VideoEditorSelectionKind.TRACK:
      return selectedTrack
        ? {
            icon: renderSidebarIcon(
              selectedTrack.role === VideoProjectTrackRole.CAMERA
                ? Camera
                : selectedTrack.kind === VideoTrackKind.AUDIO
                  ? Volume2
                  : Film
            ),
            label: selectedTrack.name,
            title: selectedTrack.name,
          }
        : createStaticSelectionMeta(Film, 'videoEditor.timeline.tracksTitle');
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return createStaticSelectionMeta(Sparkles, 'videoEditor.timeline.transitionLane');
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      return createStaticSelectionMeta(MousePointer2, 'videoEditor.timeline.cursorLane');
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return createStaticSelectionMeta(CircleDot, 'videoEditor.sidebar.objectTracksTitle');
    case VideoEditorSelectionKind.ACTION_OCCURRENCE:
      return createStaticSelectionMeta(Sparkles, 'videoEditor.timeline.actionsLane');
    case VideoEditorSelectionKind.HISTORY_SPAN:
      return createStaticSelectionMeta(Keyboard, 'videoEditor.timeline.historyTyping');
    case VideoEditorSelectionKind.HISTORY_LANE:
      return createStaticSelectionMeta(Sparkles, 'videoEditor.timeline.telemetryLane');
    case VideoEditorSelectionKind.MOTION_LANE:
    case VideoEditorSelectionKind.MOTION_REGION:
      return createStaticSelectionMeta(Search, 'videoEditor.timeline.motionLane');
    case VideoEditorSelectionKind.MOTION_CONNECTION:
      return createStaticSelectionMeta(Search, 'videoEditor.timeline.framingConnection');
  }
}

type WorkspaceSidebarHeaderProps = Pick<
  WorkspaceSidebarPanelContentProps,
  'inspectorMode' | 'selectionIcon' | 'selectionTitle' | 'selectedTrack'
>;

export function WorkspaceSidebarHeader({
  inspectorMode,
  selectionIcon,
  selectionTitle,
}: WorkspaceSidebarHeaderProps) {
  const headerClassName = [
    'flex shrink-0 flex-col',
    'bg-[color:var(--sniptale-color-surface-panel)]',
  ].join(' ');

  return (
    <div className={headerClassName}>
      <WorkspaceSidebarHeaderTitleRow
        inspectorMode={inspectorMode}
        selectionIcon={selectionIcon}
        selectionTitle={selectionTitle}
      />
    </div>
  );
}

function WorkspaceSidebarHeaderTitleRow({
  inspectorMode,
  selectionIcon,
  selectionTitle,
}: Pick<WorkspaceSidebarHeaderProps, 'inspectorMode' | 'selectionIcon' | 'selectionTitle'>) {
  return (
    <div
      className="flex h-[52px] w-full min-w-0 items-center gap-2 px-3"
      data-ui="video-editor.workspace.sidebar-header-title-row"
    >
      <span
        className={[
          'flex shrink-0 items-center justify-center',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {selectionIcon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[var(--sniptale-color-text-primary)]">
          {getInspectorHeaderTitle(inspectorMode, selectionTitle)}
        </div>
      </div>
    </div>
  );
}

function getInspectorHeaderTitle(
  inspectorMode: WorkspaceSidebarProps['inspectorMode'],
  selectionTitle: string
) {
  switch (inspectorMode) {
    case 'selection':
      return selectionTitle;
  }
}
