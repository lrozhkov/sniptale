import { translate } from '../../../../../platform/i18n';
import { getProjectSceneBackground } from '../../../../../features/video/project/scene/background';
import { VideoProjectAssetType } from '../../../../../features/video/project/types';
import { getVisibleProjectActionEvents } from '../../../../project/operations/action-events';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { NumberInput } from '../inputs/number';
import { SceneObjectTracksPanel } from './object-tracks';
import {
  DetailItem,
  DetailList,
  PANEL_HEADING_CLASS_NAME,
  PANEL_META_CLASS_NAME,
  PANEL_SECTION_CLASS_NAME,
} from '../shared/panel';
import { getSceneBackgroundSummaryLabel, SceneBackgroundFields } from '../scene-background/fields';

export function InspectScenePanel(props: WorkspaceSidebarSelectionPanelProps) {
  const sceneBackground = getProjectSceneBackground(props.project);
  const imageAssets = props.project.assets.filter(
    (asset) => asset.type === VideoProjectAssetType.IMAGE
  );

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createSceneGroups(props, sceneBackground, imageAssets)} />
    </section>
  );
}

function createSceneGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  sceneBackground: ReturnType<typeof getProjectSceneBackground>,
  imageAssets: WorkspaceSidebarSelectionPanelProps['project']['assets']
) {
  const objectTracks = props.project.objectTracks ?? [];
  return [
    {
      id: 'info',
      label: translate('videoEditor.sidebar.inspectorGroupSummary'),
      content: <SceneInfo project={props.project} sceneBackground={sceneBackground} />,
    },
    {
      id: 'canvas',
      label: translate('videoEditor.sidebar.inspectorGroupCanvas'),
      defaultActive: true,
      content: (
        <SceneProjectSizeFields
          height={props.project.height}
          onResizeProject={props.onResizeProject}
          width={props.project.width}
        />
      ),
    },
    {
      id: 'background',
      label: translate('videoEditor.sidebar.inspectorGroupBackground'),
      content: (
        <SceneBackgroundFields
          imageAssets={imageAssets}
          onPreviewSceneBackground={props.onPreviewSceneBackground}
          onRememberRecentColor={props.onRememberRecentColor}
          onResetSceneBackgroundPreview={props.onResetSceneBackgroundPreview}
          onSetSceneBackground={props.onSetSceneBackground}
          recentColors={props.recentColors}
          sceneBackground={sceneBackground}
        />
      ),
    },
    createSceneObjectTracksGroup(props, objectTracks),
  ] as const;
}

function createSceneObjectTracksGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  objectTracks: NonNullable<WorkspaceSidebarSelectionPanelProps['project']['objectTracks']>
) {
  return {
    id: 'object-tracks',
    label: translate('videoEditor.sidebar.inspectorGroupObjectTracks'),
    visible: objectTracks.length > 0,
    content: (
      <SceneObjectTracksPanel
        objectTracks={objectTracks}
        onDeleteObjectTrack={props.onDeleteObjectTrack}
        onSelectObjectTrack={props.onSelectObjectTrack}
        selectedObjectTrackId={props.selectedObjectTrack?.id ?? null}
      />
    ),
  } as const;
}

function SceneInfo(props: {
  project: WorkspaceSidebarSelectionPanelProps['project'];
  sceneBackground: ReturnType<typeof getProjectSceneBackground>;
}) {
  return (
    <div className="space-y-3">
      <SceneHeader project={props.project} />
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.projectSourceLabel')}
          value={getProjectSourceLabel(props.project.source.kind)}
        />
        <DetailItem
          label={translate('videoEditor.timeline.cursorLane')}
          value={getCursorSummaryLabel(props.project)}
        />
        <DetailItem
          label={translate('videoEditor.timeline.actionsLane')}
          value={getActionSummaryLabel(props.project)}
        />
        <DetailItem
          label={translate('videoEditor.sidebar.projectBackgroundLabel')}
          value={getSceneBackgroundSummaryLabel(props.sceneBackground, props.project)}
        />
      </DetailList>
    </div>
  );
}

function SceneHeader({ project }: Pick<WorkspaceSidebarSelectionPanelProps, 'project'>) {
  const projectMeta = [
    `${project.width}×${project.height}`,
    `${project.fps} ${translate('videoEditor.sidebar.projectFpsSuffix')}`,
    `${project.duration.toFixed(1)}${translate('videoEditor.sidebar.projectDurationSecondsSuffix')}`,
  ].join(' · ');

  return (
    <div>
      <p className={PANEL_HEADING_CLASS_NAME}>{translate('videoEditor.sidebar.projectTitle')}</p>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{projectMeta}</p>
    </div>
  );
}

function SceneProjectSizeFields(props: {
  height: number;
  onResizeProject: WorkspaceSidebarSelectionPanelProps['onResizeProject'];
  width: number;
}) {
  const maxCanvasSize = 7680;
  return (
    <div className="space-y-3">
      <NumberInput
        label={translate('videoEditor.sidebar.canvasWidthLabel')}
        value={props.width}
        min={320}
        max={maxCanvasSize}
        scrub
        onChange={(value) => props.onResizeProject(value, props.height)}
      />
      <NumberInput
        label={translate('videoEditor.sidebar.canvasHeightLabel')}
        value={props.height}
        min={180}
        max={maxCanvasSize}
        scrub
        onChange={(value) => props.onResizeProject(props.width, value)}
      />
    </div>
  );
}

function getProjectSourceLabel(
  sourceKind: WorkspaceSidebarSelectionPanelProps['project']['source']['kind']
) {
  switch (sourceKind) {
    case 'recording':
      return translate('videoEditor.sidebar.projectSourceRecording');
    case 'scenario':
      return translate('videoEditor.sidebar.projectSourceScenario');
    case 'manual':
      return translate('videoEditor.sidebar.projectSourceManual');
  }
}

function getCursorSummaryLabel(project: WorkspaceSidebarSelectionPanelProps['project']) {
  if (!project.cursorTrack) {
    return project.source.kind === 'recording'
      ? translate('videoEditor.sidebar.cursorTrackUnavailable')
      : translate('videoEditor.sidebar.cursorTrackNotAdded');
  }

  return project.cursorTrack.captureMode === 'embedded-fallback'
    ? translate('videoEditor.sidebar.cursorTrackEmbedded')
    : translate('videoEditor.sidebar.cursorTrackSeparate');
}

function getActionSummaryLabel(project: WorkspaceSidebarSelectionPanelProps['project']) {
  const actionEvents = getVisibleProjectActionEvents(project);
  if (actionEvents.length > 0) {
    return String(actionEvents.length);
  }

  return project.source.kind === 'recording'
    ? translate('videoEditor.sidebar.actionTrackUnavailable')
    : '0';
}
