import { SceneEdgesFields } from './scene-edges';
import { InspectProjectCommentsPanel } from './comments';
import { SceneWatermarkFields } from './watermark';
import { InspectProjectTextPanel } from './text';
import { InspectCursorPathSettings } from './cursor-path';
import { GridSettingsPanel } from '../../settings';
import { translate } from '../../../../../platform/i18n';
import { getProjectSceneBackground } from '../../../../../features/video/project/scene/background';
import { VideoProjectAssetType } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SceneCanvasFields } from './scene-canvas';
import { SceneObjectTracksPanel } from './object-tracks';
import { PANEL_META_CLASS_NAME, PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { SceneBackgroundFields } from '../scene-background/fields';

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
      semantic: 'info' as const,
      label: translate('videoEditor.sidebar.inspectorGroupSummary'),
      content: <SceneInfo project={props.project} sceneBackground={sceneBackground} />,
    },
    {
      id: 'canvas',
      semantic: 'canvas' as const,
      label: translate('videoEditor.sidebar.inspectorGroupCanvas'),
      defaultActive: true,
      content: (
        <SceneCanvasFields
          height={props.project.height}
          onResizeProject={props.onResizeProject}
          width={props.project.width}
        />
      ),
    },
    {
      id: 'background',
      semantic: 'background' as const,
      label: translate('videoEditor.sidebar.inspectorGroupBackground'),
      content: (
        <SceneBackgroundFields
          imageAssets={imageAssets}
          onPreviewSceneBackground={props.onPreviewSceneBackground}
          onRememberRecentColor={props.onRememberRecentColor}
          onResetSceneBackgroundPreview={props.onResetSceneBackgroundPreview}
          onImportImage={props.onImportImage}
          onSetSceneBackground={props.onSetSceneBackground}
          recentColors={props.recentColors}
          sceneBackground={sceneBackground}
        />
      ),
    },
    {
      id: 'watermark',
      semantic: 'watermark' as const,
      label: translate('gallery.videoReview.watermark'),
      visible: Boolean(props.watermark && props.onImportImage),
      content:
        props.watermark && props.onImportImage ? (
          <SceneWatermarkFields
            project={props.typingProject ?? props.project}
            runtime={props.watermark}
            onImportImage={props.onImportImage}
          />
        ) : null,
    },
    {
      id: 'scene-edges',
      semantic: 'transition' as const,
      label: translate('videoEditor.sidebar.sceneEdges'),
      visible: Boolean(props.sceneEdges),
      content: props.sceneEdges ? (
        <SceneEdgesFields
          project={props.typingProject ?? props.project}
          runtime={props.sceneEdges}
        />
      ) : null,
    },
    {
      id: 'text',
      semantic: 'content' as const,
      label: translate('videoEditor.sidebar.textDocuments'),
      content: (
        <InspectProjectTextPanel
          key={props.project.id}
          project={props.project}
          {...(props.textRewrite ? { rewrite: props.textRewrite } : {})}
          {...(props.textVoice ? { voice: props.textVoice } : {})}
        />
      ),
    },
    {
      id: 'comments',
      semantic: 'comments' as const,
      label: translate('videoEditor.sidebar.comments'),
      content: <InspectProjectCommentsPanel project={props.typingProject ?? props.project} />,
    },
    {
      id: 'grid',
      semantic: 'grid' as const,
      label: translate('videoEditor.sidebar.gridSettingsTitle'),
      visible: Boolean(props.gridSettings),
      content: props.gridSettings ? (
        <GridSettingsPanel
          grid={props.gridSettings}
          recentColors={props.recentColors}
          onRememberRecentColor={props.onRememberRecentColor}
        />
      ) : null,
    },
    createSceneObjectTracksGroup(props, objectTracks),
    {
      id: 'cursor-path',
      semantic: 'tracking' as const,
      label: translate('videoEditor.sidebar.cursorFocusPathTitle'),
      content: <InspectCursorPathSettings project={props.project} />,
    },
  ] as const;
}

function createSceneObjectTracksGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  objectTracks: NonNullable<WorkspaceSidebarSelectionPanelProps['project']['objectTracks']>
) {
  return {
    id: 'object-tracks',
    semantic: 'tracking' as const,
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
    </div>
  );
}

function SceneHeader({ project }: Pick<WorkspaceSidebarSelectionPanelProps, 'project'>) {
  const projectMeta = [
    `${project.fps} ${translate('videoEditor.sidebar.projectFpsSuffix')}`,
    `${project.duration.toFixed(1)}${translate('videoEditor.sidebar.projectDurationSecondsSuffix')}`,
  ].join(' · ');

  return (
    <div>
      <p className={`mt-1 ${PANEL_META_CLASS_NAME}`}>{projectMeta}</p>
    </div>
  );
}
