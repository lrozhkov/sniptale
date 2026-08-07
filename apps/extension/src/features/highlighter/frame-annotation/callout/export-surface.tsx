import type { FrameAnnotationSnapshotV1 } from '../model';
import { resolveFrameSurface } from '../../frame-surface';
import { getCalloutFrameColors, resolveCalloutColorBindings } from '../../callout-color-bindings';
import { createFrameCalloutActions } from './actions';
import { useFrameCalloutEditing } from './editing';
import { FrameCalloutInteractiveSurface } from './interactive-surface';
import { createCalloutSettingsKey } from './settings-key';

const ignoreExportInteraction = () => undefined;

export function FrameCalloutExportSurface(props: {
  frame: FrameAnnotationSnapshotV1;
  portalTarget: Element | DocumentFragment;
}) {
  const callout = props.frame.callout!;
  const editing = useFrameCalloutEditing({
    frameId: props.frame.id,
    htmlContent: callout.content.bodyHtml,
    isEditing: false,
    onContentChange: ignoreExportInteraction,
    onDelete: ignoreExportInteraction,
    onStartEditing: ignoreExportInteraction,
    onStopEditing: ignoreExportInteraction,
    settingsKey: createCalloutSettingsKey(callout),
    titleText: callout.content.titleText,
  });
  const actions = createFrameCalloutActions({
    apply: ignoreExportInteraction,
    callout,
    onDelete: ignoreExportInteraction,
    onSettingsClick: ignoreExportInteraction,
    onStartEditing: ignoreExportInteraction,
    onStopEditing: ignoreExportInteraction,
  });
  const frameSurface = resolveFrameSurface(props.frame);
  return (
    <FrameCalloutInteractiveSurface
      chrome="export"
      editing={editing}
      frameBorderWidth={frameSurface.strokeVisible ? frameSurface.geometry.strokeWidth : 0}
      frameId={props.frame.id}
      frameRect={props.frame}
      isEditing={false}
      isFrameEditing={false}
      isSettingsOpen={false}
      {...actions}
      portalTarget={props.portalTarget}
      portalTheme={null}
      settings={{
        ...callout,
        style: resolveCalloutColorBindings(
          callout.style,
          getCalloutFrameColors(props.frame.borderSettings)
        ),
      }}
      settingsAnchorRef={{ current: null }}
      showSettingsHandle={false}
      zIndex={props.frame.ordering + 1}
    />
  );
}
