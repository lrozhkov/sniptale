import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import {
  isAnnotationClip,
  isSubtitleClip,
  isVideoClip,
} from '../../../../../features/video/project/timeline';
import type { VideoProjectAnnotationClip } from '../../../../../features/video/project/types/index';
import { VideoProjectClipType } from '../../../../../features/video/project/types';
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
import { ClipCursorDetectionPanel } from './cursor-detection';

export function InspectClipPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const clip = props.selectedClip;
  if (!clip) {
    return <SelectionEmptyState />;
  }

  const runtime = createSelectionRuntime(props);

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel groups={createClipGroups(props, clip, runtime)} />
    </section>
  );
}

function createClipGroups(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>
) {
  const asset = resolveClipAsset(props.project, clip);
  const infoGroup = {
    id: 'info',
    label: translate('videoEditor.sidebar.inspectorGroupSummary'),
    defaultActive: true,
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
  const frameContent = createFrameContent(props, clip, runtime, transformContent);
  const audioContent = renderAudioFields(
    clip,
    runtime.linkedAudioClip,
    runtime.linkedVideoClip,
    runtime.selectedTrackLocked,
    props.onUpdateClipMuted,
    props.onUpdateClipVolume,
    props.onUpdateClipAudioEnvelope
  );
  const contentFields = renderClipContentFields(props, clip, runtime);
  const styleFields = renderClipStyleFields(props, clip, runtime);

  return [
    createGeneralGroup(contentFields),
    createTimingGroup(props, clip, runtime.selectedTrackLocked),
    createTransformGroup(clip, frameContent),
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
    createObjectTrackingGroup(props, clip, runtime.selectedTrackLocked),
  ] as const;
}

function createFrameContent(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  runtime: ReturnType<typeof createSelectionRuntime>,
  transformContent: React.ReactNode
) {
  const mediaFrameContent = isMediaFrameClip(clip) ? (
    <MediaFrameControls {...props} clip={clip} locked={runtime.selectedTrackLocked} />
  ) : null;

  if (transformContent === null && mediaFrameContent === null) {
    return null;
  }

  return (
    <div className="space-y-4">
      {transformContent}
      {mediaFrameContent}
    </div>
  );
}

function isMediaFrameClip(clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>) {
  return isVideoClip(clip) || clip.type === VideoProjectClipType.IMAGE;
}

function createObjectTrackingGroup(
  props: WorkspaceSidebarSelectionPanelProps,
  clip: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedClip']>,
  locked: boolean
) {
  return {
    id: 'object-tracking',
    label: translate('videoEditor.sidebar.inspectorGroupTracking'),
    content: (
      <ClipCursorDetectionPanel
        clipId={clip.id}
        cursorDetection={props.cursorDetection}
        project={props.project}
      />
    ),
    visible: isVideoClip(clip) && !locked,
  } as const;
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
