import React from 'react';
import {
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
import type { InspectorGroupHeaderSlot } from './selection/grouped-inspector';
import { InspectorGroupSwitch } from './selection/grouped-inspector';
import { getClipTypeLabel } from '../../chrome/display';

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
  clip: WorkspaceSidebarProps['selectedClip']
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
      return createStaticSelectionMeta(Film, 'videoEditor.timeline.tracksTitle');
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return createStaticSelectionMeta(Sparkles, 'videoEditor.timeline.transitionLane');
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      return createStaticSelectionMeta(MousePointer2, 'videoEditor.timeline.cursorLane');
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return createStaticSelectionMeta(CircleDot, 'videoEditor.sidebar.objectTracksTitle');
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      return createStaticSelectionMeta(Sparkles, 'videoEditor.timeline.actionsLane');
    case VideoEditorSelectionKind.MOTION_REGION:
      return createStaticSelectionMeta(Search, 'videoEditor.timeline.motionLane');
  }
}

type WorkspaceSidebarHeaderProps = Pick<
  WorkspaceSidebarPanelContentProps,
  'inspectorMode' | 'selectionIcon' | 'selectionTitle' | 'selectedTrack'
> & {
  inspectorHeaderSlot: InspectorGroupHeaderSlot | null;
};

export function WorkspaceSidebarHeader({
  inspectorHeaderSlot,
  inspectorMode,
  selectionIcon,
  selectionTitle,
  selectedTrack,
}: WorkspaceSidebarHeaderProps) {
  const headerClassName = [
    'flex shrink-0 flex-col border-b border-[color:var(--sniptale-color-border-soft)]',
    'bg-[color:var(--sniptale-color-surface-panel)]',
  ].join(' ');

  return (
    <div className={headerClassName}>
      <WorkspaceSidebarHeaderTitleRow
        inspectorMode={inspectorMode}
        selectedTrack={selectedTrack}
        selectionIcon={selectionIcon}
        selectionTitle={selectionTitle}
      />
      {inspectorMode === 'selection' && inspectorHeaderSlot ? (
        <WorkspaceSidebarHeaderGroupsRow inspectorHeaderSlot={inspectorHeaderSlot} />
      ) : null}
    </div>
  );
}

function WorkspaceSidebarHeaderTitleRow({
  inspectorMode,
  selectedTrack,
  selectionIcon,
  selectionTitle,
}: Pick<
  WorkspaceSidebarHeaderProps,
  'inspectorMode' | 'selectedTrack' | 'selectionIcon' | 'selectionTitle'
>) {
  return (
    <div
      className="flex min-h-14 w-full min-w-0 items-center gap-3 px-3"
      data-ui="video-editor.workspace.sidebar-header-title-row"
    >
      <span
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_88%,transparent)]',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {selectionIcon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {getInspectorHeaderTitle(inspectorMode, selectionTitle)}
        </div>
        <div className="truncate text-xs uppercase tracking-[0.12em] text-[var(--sniptale-color-text-dim)]">
          {getInspectorHeaderSubtitle(inspectorMode, selectedTrack)}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSidebarHeaderGroupsRow({
  inspectorHeaderSlot,
}: Pick<WorkspaceSidebarHeaderProps, 'inspectorHeaderSlot'>) {
  if (!inspectorHeaderSlot) {
    return null;
  }

  return (
    <div
      className="w-full min-w-0 border-t border-[color:var(--sniptale-color-border-subtle)] px-3 py-2"
      data-ui="video-editor.workspace.sidebar-header-groups-row"
    >
      <InspectorGroupSwitch
        activeGroupId={inspectorHeaderSlot.activeGroupId}
        ariaLabel={inspectorHeaderSlot.ariaLabel}
        groups={inspectorHeaderSlot.groups}
        onChange={inspectorHeaderSlot.onChange}
      />
    </div>
  );
}

function getInspectorHeaderTitle(
  inspectorMode: WorkspaceSidebarProps['inspectorMode'],
  selectionTitle: string
) {
  switch (inspectorMode) {
    case 'grid':
      return translate('videoEditor.sidebar.gridSettingsTitle');
    case 'selection':
      return selectionTitle;
  }
}

function getInspectorHeaderSubtitle(
  inspectorMode: WorkspaceSidebarProps['inspectorMode'],
  selectedTrack: WorkspaceSidebarProps['selectedTrack']
) {
  switch (inspectorMode) {
    case 'grid':
      return translate('videoEditor.sidebar.gridSettingsSubtitle');
    case 'selection':
      return selectedTrack
        ? `${translate('videoEditor.sidebar.trackPrefix')} ${getSelectedTrackKindLabel(selectedTrack.kind)}`
        : translate('videoEditor.sidebar.projectInspector');
  }
}

function getSelectedTrackKindLabel(
  kind: NonNullable<WorkspaceSidebarProps['selectedTrack']>['kind']
) {
  switch (kind) {
    case 'PRIMARY':
      return translate('videoEditor.timeline.trackKindPrimary');
    case 'AUDIO':
      return translate('videoEditor.timeline.trackKindAudio');
    case 'OVERLAY':
      return translate('videoEditor.timeline.trackKindOverlay');
    case 'SUBTITLE':
      return translate('videoEditor.timeline.trackKindSubtitle');
  }
}
