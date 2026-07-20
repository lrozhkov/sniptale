import type { WorkspaceSidebarProps } from '../../contracts/props';

const noop = () => undefined;
const noopAsync = async () => undefined;

type OptionalWorkspaceSidebarProps<Key extends keyof WorkspaceSidebarProps> = {
  [Prop in Key]?: WorkspaceSidebarProps[Prop] | undefined;
};

type SelectionAnnotationUpdateSource = OptionalWorkspaceSidebarProps<
  | 'onConvertTextClipToAnnotation'
  | 'onUpdateAnnotationClipContent'
  | 'onUpdateAnnotationClipStyle'
  | 'onUpdateAnnotationClipTemplate'
>;

type SelectionAnnotationUpdateDefaults = {
  onConvertTextClipToAnnotation?: NonNullable<
    WorkspaceSidebarProps['onConvertTextClipToAnnotation']
  >;
  onUpdateAnnotationClipContent: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipContent']
  >;
  onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>;
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
  >;
};

type SelectionSceneClipUpdateSource = Pick<
  WorkspaceSidebarProps,
  | 'onDetachClipGroup'
  | 'onResizeProject'
  | 'onSetSceneBackground'
  | 'onUpdateClipAudioEnvelope'
  | 'onUpdateClipFades'
  | 'onUpdateClipMuted'
  | 'onUpdateClipTransform'
  | 'onUpdateClipVolume'
  | 'onUpdateMediaClipFitMode'
> &
  OptionalWorkspaceSidebarProps<
    | 'onPreviewSceneBackground'
    | 'onRememberRecentColor'
    | 'onResetSceneBackgroundPreview'
    | 'onUpdateClipPlaybackRate'
  >;

type SelectionSceneClipUpdateDefaults = Pick<
  WorkspaceSidebarProps,
  | 'onDetachClipGroup'
  | 'onResizeProject'
  | 'onSetSceneBackground'
  | 'onUpdateClipAudioEnvelope'
  | 'onUpdateClipFades'
  | 'onUpdateClipMuted'
  | 'onUpdateClipTransform'
  | 'onUpdateClipVolume'
  | 'onUpdateMediaClipFitMode'
> & {
  onPreviewSceneBackground: NonNullable<WorkspaceSidebarProps['onPreviewSceneBackground']>;
  onRememberRecentColor: NonNullable<WorkspaceSidebarProps['onRememberRecentColor']>;
  onResetSceneBackgroundPreview: NonNullable<
    WorkspaceSidebarProps['onResetSceneBackgroundPreview']
  >;
  onUpdateClipPlaybackRate: NonNullable<WorkspaceSidebarProps['onUpdateClipPlaybackRate']>;
};

export function createSelectionAnnotationUpdateDefaults(
  props: SelectionAnnotationUpdateSource
): SelectionAnnotationUpdateDefaults {
  return {
    ...(props.onConvertTextClipToAnnotation
      ? { onConvertTextClipToAnnotation: props.onConvertTextClipToAnnotation }
      : {}),
    onUpdateAnnotationClipContent: props.onUpdateAnnotationClipContent ?? noop,
    onUpdateAnnotationClipStyle: props.onUpdateAnnotationClipStyle ?? noop,
    onUpdateAnnotationClipTemplate: props.onUpdateAnnotationClipTemplate ?? noop,
  };
}

export function createSelectionSceneClipUpdateDefaults(
  props: SelectionSceneClipUpdateSource
): SelectionSceneClipUpdateDefaults {
  return {
    onDetachClipGroup: props.onDetachClipGroup,
    onPreviewSceneBackground: props.onPreviewSceneBackground ?? noop,
    onRememberRecentColor: props.onRememberRecentColor ?? noopAsync,
    onResetSceneBackgroundPreview: props.onResetSceneBackgroundPreview ?? noop,
    onResizeProject: props.onResizeProject,
    onSetSceneBackground: props.onSetSceneBackground,
    onUpdateClipFades: props.onUpdateClipFades,
    onUpdateClipMuted: props.onUpdateClipMuted,
    onUpdateClipTransform: props.onUpdateClipTransform,
    onUpdateClipVolume: props.onUpdateClipVolume,
    onUpdateClipAudioEnvelope: props.onUpdateClipAudioEnvelope,
    onUpdateClipPlaybackRate: props.onUpdateClipPlaybackRate ?? noop,
    onUpdateMediaClipFitMode: props.onUpdateMediaClipFitMode,
  };
}
