import { translate } from '../../../../../platform/i18n';
import { TextareaField } from '../../../../../ui/compact-inspector-controls';
import {
  isAnnotationClip,
  isSubtitleClip,
  isTextClip,
} from '../../../../../features/video/project/timeline';
import type { VideoProjectAnnotationClip } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { AnnotationFields } from '../annotation/fields';
import { renderShapeStyleFields } from './shape-style';
import { renderTextStyleFields } from './text-style';

export { renderShapeStyleFields } from './shape-style';
export { renderTextStyleFields } from './text-style';

export function renderTextContentFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateTextContent: WorkspaceSidebarProps['onUpdateTextContent']
) {
  if (!selectedClip) {
    return null;
  }

  if (!isTextClip(selectedClip) && !isSubtitleClip(selectedClip)) {
    return null;
  }

  const textClip = selectedClip;
  return (
    <div className="space-y-3">
      <TextContentField
        clipId={textClip.id}
        disabled={selectedTrackLocked}
        text={textClip.text}
        onUpdateTextContent={onUpdateTextContent}
      />
    </div>
  );
}

function TextContentField(props: {
  clipId: string;
  disabled: boolean;
  onUpdateTextContent: WorkspaceSidebarProps['onUpdateTextContent'];
  text: string;
}) {
  return (
    <TextareaField
      disabled={props.disabled}
      label={translate('videoEditor.sidebar.textLabel')}
      value={props.text}
      onChange={(value) => props.onUpdateTextContent(props.clipId, value)}
    />
  );
}

export function renderTextAndShapeFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  recentColors: WorkspaceSidebarProps['recentColors'],
  onRememberRecentColor: WorkspaceSidebarProps['onRememberRecentColor'] | undefined,
  onUpdateTextContent: WorkspaceSidebarProps['onUpdateTextContent'],
  onUpdateTextStyle: WorkspaceSidebarProps['onUpdateTextStyle'],
  onUpdateShapeStyle: WorkspaceSidebarProps['onUpdateShapeStyle'],
  onConvertTextClipToAnnotation?: WorkspaceSidebarProps['onConvertTextClipToAnnotation'],
  onUpdateAnnotationClipContent?: WorkspaceSidebarProps['onUpdateAnnotationClipContent'],
  onUpdateAnnotationClipStyle?: WorkspaceSidebarProps['onUpdateAnnotationClipStyle'],
  onUpdateAnnotationClipTemplate?: WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
) {
  if (
    selectedClip &&
    isAnnotationClip(selectedClip) &&
    onUpdateAnnotationClipContent &&
    onUpdateAnnotationClipStyle &&
    onUpdateAnnotationClipTemplate
  ) {
    return renderAnnotationFields(
      selectedClip,
      selectedTrackLocked,
      recentColors,
      onRememberRecentColor,
      onUpdateAnnotationClipContent,
      onUpdateAnnotationClipStyle,
      onUpdateAnnotationClipTemplate
    );
  }

  return (
    renderCombinedTextFields(
      selectedClip,
      selectedTrackLocked,
      onUpdateTextContent,
      onUpdateTextStyle,
      recentColors,
      onRememberRecentColor,
      onConvertTextClipToAnnotation
    ) ??
    renderShapeStyleFields(
      selectedClip,
      selectedTrackLocked,
      onUpdateShapeStyle,
      recentColors,
      onRememberRecentColor
    )
  );
}

function renderAnnotationFields(
  selectedClip: VideoProjectAnnotationClip,
  selectedTrackLocked: boolean,
  recentColors: WorkspaceSidebarProps['recentColors'],
  onRememberRecentColor: WorkspaceSidebarProps['onRememberRecentColor'] | undefined,
  onUpdateAnnotationClipContent: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipContent']
  >,
  onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>,
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
  >
) {
  return (
    <AnnotationFields
      clip={selectedClip}
      disabled={selectedTrackLocked}
      recentColors={recentColors}
      onRememberRecentColor={onRememberRecentColor}
      onUpdateAnnotationClipContent={onUpdateAnnotationClipContent}
      onUpdateAnnotationClipStyle={onUpdateAnnotationClipStyle}
      onUpdateAnnotationClipTemplate={onUpdateAnnotationClipTemplate}
    />
  );
}

function renderCombinedTextFields(
  selectedClip: WorkspaceSidebarProps['selectedClip'],
  selectedTrackLocked: boolean,
  onUpdateTextContent: WorkspaceSidebarProps['onUpdateTextContent'],
  onUpdateTextStyle: WorkspaceSidebarProps['onUpdateTextStyle'],
  recentColors?: WorkspaceSidebarProps['recentColors'],
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'],
  onConvertTextClipToAnnotation?: WorkspaceSidebarProps['onConvertTextClipToAnnotation']
) {
  const content = renderTextContentFields(selectedClip, selectedTrackLocked, onUpdateTextContent);
  const style = renderTextStyleFields(
    selectedClip,
    selectedTrackLocked,
    onUpdateTextStyle,
    recentColors,
    onRememberRecentColor,
    onConvertTextClipToAnnotation
  );

  if (!content && !style) {
    return null;
  }

  return (
    <div className="space-y-3">
      {content}
      {style}
    </div>
  );
}
