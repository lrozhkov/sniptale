import type { FrameAnnotationSnapshotV1 } from '../model';
import { resolveFrameSurface } from '../../frame-surface';
import { getCalloutFrameColors, resolveCalloutColorBindings } from '../../callout-color-bindings';
import { createFrameCalloutActions } from './actions';
import { useFrameCalloutEditing } from './editing';
import { FrameCalloutInteractiveSurface } from './interactive-surface';
import { createCalloutSettingsKey } from './settings-key';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';

const ignoreExportInteraction = () => undefined;

export function FrameCalloutExportSurface(props: {
  frame: FrameAnnotationSnapshotV1;
  callout: CalloutSettings;
  calloutIndex?: number;
  portalTarget: Element | DocumentFragment;
}) {
  const callout = props.callout;
  const surfaceId =
    props.calloutIndex === undefined
      ? props.frame.id
      : `${props.frame.id}:callout:${props.calloutIndex}`;
  const editing = useFrameCalloutEditing({
    frameId: surfaceId,
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
      chromeScale={1}
      editing={editing}
      frameBorderWidth={frameSurface.strokeVisible ? frameSurface.geometry.strokeWidth : 0}
      frameId={surfaceId}
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
