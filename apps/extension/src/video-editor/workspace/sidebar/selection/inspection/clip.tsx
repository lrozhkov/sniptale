import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import {
  isAnnotationClip,
  isSubtitleClip,
  isVideoClip,
} from '../../../../../features/video/project/timeline';
import type { VideoProjectAnnotationClip } from '../../../../../features/video/project/types/index';
import {
  VideoProjectClipType,
  VideoProjectTrackRole,
} from '../../../../../features/video/project/types';
import { resolveAnnotationTemplateControls } from '../../../../../features/video/project/annotation/template-controls';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { createAnnotationGroups } from '../annotation/fields';
import { ClipTimingControls } from '../inputs/clip-timing';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { createSelectionRuntime, SelectionEmptyState } from './helpers';
import { renderAudioFields } from '../inputs/audio-fields';
import { MediaFrameControls } from '../inputs/media-frame';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import {
  renderShapeStyleFields,
  renderTextContentFields,
  renderTextStyleFields,
} from '../inputs/text-shape';
import { renderTransformFields } from '../inputs/transform-fields';
import { createEffectInstanceGroup } from '../effect-instance/groups';
import { ClipInfo, resolveClipAsset } from './clip-info';
import { isVideoEditorPresentedClip } from '../../../../project/operations/presented-tracks';
import { CameraLayoutControls } from '../inputs/camera-layout';

export function InspectClipPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const clip = props.selectedClip;
  if (!clip || !isVideoEditorPresentedClip(props.project, clip)) {
    return <SelectionEmptyState />;
  }

  const runtime = createSelectionRuntime(props);
  const cameraRoleClip = isCameraRoleVideoClip(props.project, clip);

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        key={cameraRoleClip ? 'camera' : isMediaFrameClip(clip) ? 'media' : 'standard'}
        groups={createClipGroups(props, clip, runtime, cameraRoleClip)}
      />
    </section>
  );
}

function createClipGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>,
  cameraRoleClip: boolean
) {
  const asset = resolveClipAsset(props.project, clip);
  const infoGroup = {
    id: 'info',
    label: translate('videoEditor.sidebar.inspectorGroupSummary'),
    defaultActive: !cameraRoleClip,
    content: <ClipInfo asset={asset} clip={clip} locked={runtime.selectedTrackLocked} />,
  } as const;

  if (
    isAnnotationClip(clip) &&
    props.onUpdateAnnotationClipContent &&
    props.onUpdateAnnotationClipStyle &&
    props.onUpdateAnnotationClipTemplate
  ) {
    return [
      infoGroup,
      createTimingGroup(props, clip, runtime.selectedTrackLocked),
      ...createAnnotationClipGroups(props, clip, runtime, {
        onUpdateAnnotationClipContent: props.onUpdateAnnotationClipContent,
        onUpdateAnnotationClipStyle: props.onUpdateAnnotationClipStyle,
        onUpdateAnnotationClipTemplate: props.onUpdateAnnotationClipTemplate,
      }),
      createClipEffectGroup(props, clip, runtime.selectedTrackLocked),
    ] as const;
  }

  return [infoGroup, ...createStandardClipGroups(props, clip, runtime)] as const;
}

function createAnnotationClipGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: VideoProjectAnnotationClip,
  runtime: ReturnType<typeof createSelectionRuntime>,
  handlers: AnnotationClipUpdateHandlers
) {
  const controls = resolveAnnotationTemplateControls(clip.templateKind);

  return createAnnotationGroups(
    {
      clip,
      disabled: runtime.selectedTrackLocked,
      recentColors: props.recentColors,
      onRememberRecentColor: props.onRememberRecentColor,
      onUpdateAnnotationClipContent: handlers.onUpdateAnnotationClipContent,
      onUpdateAnnotationClipStyle: handlers.onUpdateAnnotationClipStyle,
      onUpdateAnnotationClipTemplate: handlers.onUpdateAnnotationClipTemplate,
    },
    controls.supportsTarget
  );
}

interface AnnotationClipUpdateHandlers {
  onUpdateAnnotationClipContent: NonNullable<
    WorkspaceSidebarSelectionPanelProps['onUpdateAnnotationClipContent']
  >;
  onUpdateAnnotationClipStyle: NonNullable<
    WorkspaceSidebarSelectionPanelProps['onUpdateAnnotationClipStyle']
  >;
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarSelectionPanelProps['onUpdateAnnotationClipTemplate']
  >;
}

function createStandardClipGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>
) {
  const transformContent = renderTransformFields(
    clip,
    runtime.selectedTrackLocked,
    props.onUpdateClipTransform
  );
  const audioContent = renderAudioFields(props);
  const contentFields = renderClipContentFields(props, clip, runtime);
  const styleFields = renderClipStyleFields(props, clip, runtime);

  return [
    createGeneralGroup(contentFields),
    createCameraPlacementGroup(props, clip, runtime.selectedTrackLocked),
    createFramingGroup(props, clip, runtime.selectedTrackLocked),
    createTimingGroup(props, clip, runtime.selectedTrackLocked),
    createTransformGroup(clip, transformContent),
    {
      id: 'audio',
      label: translate('videoEditor.sidebar.inspectorGroupAudio'),
      content: audioContent,
      visible: audioContent !== null,
    },
    {
      id: 'style',
      label: getClipStyleGroupLabel(clip),
      content: styleFields,
      visible: styleFields !== null,
    },
    createClipEffectGroup(props, clip, runtime.selectedTrackLocked),
  ] as const;
}

function createCameraPlacementGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  locked: boolean
) {
  const isCameraClip = isCameraRoleVideoClip(props.project, clip);

  return {
    id: 'camera',
    label: translate('videoEditor.sidebar.inspectorGroupCamera'),
    defaultActive: isCameraClip,
    content: isCameraClip ? (
      <CameraLayoutControls
        clip={clip}
        disabled={locked}
        project={props.project}
        {...(props.onApplyCameraLayout ? { onApplyCameraLayout: props.onApplyCameraLayout } : {})}
        {...(props.onSplitCameraInterval
          ? { onSplitCameraInterval: props.onSplitCameraInterval }
          : {})}
        {...(props.canSplitCameraInterval === undefined
          ? {}
          : { canSplitCameraInterval: props.canSplitCameraInterval })}
      />
    ) : null,
    visible: isCameraClip,
  } as const;
}

function isCameraRoleVideoClip(
  project: WorkspaceSidebarSelectionPanelProps['project'],
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>
): clip is Extract<
  WorkspaceSidebarSelectionPanelProps['project']['clips'][number],
  { type: 'VIDEO' }
> {
  const track = project.tracks.find((item) => item.id === clip.trackId);
  return clip.type === VideoProjectClipType.VIDEO && track?.role === VideoProjectTrackRole.CAMERA;
}

function createFramingGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  locked: boolean
) {
  const visible = isMediaFrameClip(clip);
  return {
    id: 'framing',
    label: translate('videoEditor.sidebar.inspectorGroupFraming'),
    defaultActive: visible && !isCameraRoleVideoClip(props.project, clip),
    visible,
    content: visible ? <MediaFrameControls {...props} clip={clip} locked={locked} /> : null,
  } as const;
}

function isMediaFrameClip(clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>) {
  return isVideoClip(clip) || clip.type === VideoProjectClipType.IMAGE;
}

function createTimingGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  locked: boolean
) {
  return {
    id: 'timing',
    label: translate('videoEditor.sidebar.inspectorGroupTiming'),
    content: <ClipTimingControls {...props} clip={clip} locked={locked} />,
  } as const;
}

function createClipEffectGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  locked: boolean
) {
  const hostedInstanceId =
    clip.type === VideoProjectClipType.EFFECT ? clip.effectInstanceId : undefined;
  return createEffectInstanceGroup({
    disabled: locked,
    onDeleteEffectInstance: props.onDeleteEffectInstance ?? (() => undefined),
    onDuplicateEffectInstance: props.onDuplicateEffectInstance ?? (() => null),
    onMoveEffectInstance: props.onMoveEffectInstance ?? (() => undefined),
    onUpdateEffectInstance: props.onUpdateEffectInstance ?? (() => undefined),
    project: props.project,
    ...(hostedInstanceId
      ? { instanceId: hostedInstanceId, target: { kind: 'scene' as const } }
      : { target: { clipId: clip.id, kind: 'clip' as const } }),
  });
}

function createGeneralGroup(contentFields: React.ReactNode) {
  return {
    id: 'general',
    label: translate('videoEditor.sidebar.inspectorGroupContent'),
    content: contentFields,
    visible: contentFields !== null,
  } as const;
}

function getClipStyleGroupLabel(
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>
) {
  return isVideoClip(clip)
    ? translate('videoEditor.sidebar.inspectorGroupMedia')
    : translate('videoEditor.sidebar.inspectorGroupStyle');
}

function createTransformGroup(
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  content: React.ReactNode
) {
  return {
    id: 'transform',
    label: translate('videoEditor.sidebar.inspectorGroupTransform'),
    content,
    visible: content !== null && !isSubtitleClip(clip),
  } as const;
}

function renderClipContentFields(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>
) {
  return renderTextContentFields(clip, runtime.selectedTrackLocked, props.onUpdateTextContent);
}

function renderClipStyleFields(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>
) {
  return (
    renderTextStyleFields(
      clip,
      runtime.selectedTrackLocked,
      props.onUpdateTextStyle,
      props.recentColors,
      props.onRememberRecentColor,
      props.onConvertTextClipToAnnotation
    ) ??
    renderShapeStyleFields(
      clip,
      runtime.selectedTrackLocked,
      props.onUpdateShapeStyle,
      props.recentColors,
      props.onRememberRecentColor
    )
  );
}
