import React from 'react';
import type { FabricObject } from 'fabric';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';
import type { FrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { FrameCalloutInteractiveSurface } from '../../features/highlighter/frame-annotation/callout/interactive-surface';
import { useFrameCalloutEditing } from '../../features/highlighter/frame-annotation/callout/editing';
import { createFrameCalloutActions } from '../../features/highlighter/frame-annotation/callout/actions';
import { resolveFrameSurface } from '../../features/highlighter/frame-surface';
import {
  getCalloutFrameColors,
  resolveCalloutColorBindings,
} from '../../features/highlighter/callout-color-bindings';
import {
  CalloutVoiceButton,
  resolveCalloutVoiceButtonLeftOffset,
} from '../../composition/frame-annotation-controls/voice/button';
import { useCalloutVoiceInput } from '../../composition/frame-annotation-controls/voice/input';
import {
  getFrameCallout,
  removeFrameCallout,
  setFrameCallout,
} from '../../features/highlighter/frame-annotation/callout/collection';

export function EditorFrameCallout(props: {
  calloutIndex: number;
  coordinateSpace: FrameAnnotationCoordinateSpace;
  controlsPortalTarget: HTMLDivElement | null;
  object: FabricObject;
  portalTarget: HTMLDivElement;
  selected: boolean;
  snapshot: FrameAnnotationSnapshotV1;
  onSnapshotChange: (snapshot: FrameAnnotationSnapshotV1) => void;
  onSnapshotPreview: (snapshot: FrameAnnotationSnapshotV1) => void;
  onDraftCommit: () => void;
  onMoveEnd?: () => void;
  isSettingsOpen: boolean;
  onSettingsOpen: (anchor: HTMLButtonElement) => void;
  projectMoveRect?: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}) {
  const callout = getFrameCallout(props.snapshot, props.calloutIndex)!;
  const [isEditing, setIsEditing] = React.useState(
    () => callout.content.bodyHtml.trim() === '' && callout.content.titleText.trim() === ''
  );
  const settingsAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const apply = (nextCallout: typeof callout) =>
    props.onSnapshotChange(setFrameCallout(props.snapshot, props.calloutIndex, nextCallout));
  const preview = (nextCallout: typeof callout) =>
    props.onSnapshotPreview(setFrameCallout(props.snapshot, props.calloutIndex, nextCallout));
  const stopEditing = () => {
    setIsEditing(false);
    props.onDraftCommit();
  };
  const voice = useCalloutVoiceInput({
    contentEditableRef,
    isEditing,
    onContentChange: (bodyHtml) =>
      preview({ ...callout, content: { ...callout.content, bodyHtml } }),
  });
  const editing = useFrameCalloutEditing({
    coordinateSpace: props.coordinateSpace,
    contentEditableRef,
    frameId: props.snapshot.id,
    htmlContent: callout.content.bodyHtml,
    isEditing,
    onContentChange: (bodyHtml) =>
      preview({ ...callout, content: { ...callout.content, bodyHtml } }),
    onDelete: () => props.onSnapshotChange(removeFrameCallout(props.snapshot, props.calloutIndex)),
    onStartEditing: () => setIsEditing(true),
    onStopEditing: stopEditing,
    settingsKey: JSON.stringify(callout.style),
    stopVoiceInput: voice.actions.stop,
    titleText: callout.content.titleText,
    voiceActive: voice.state.active,
  });
  const handleEditingBlur = (event?: React.FocusEvent<HTMLDivElement>) => {
    const target = event?.relatedTarget;
    if (
      props.isSettingsOpen &&
      target instanceof Element &&
      props.controlsPortalTarget?.contains(target) &&
      target.closest('.sniptale-callout-settings-popover')
    ) {
      return;
    }
    editing.events.blur(event);
  };
  const actions = createFrameCalloutActions({
    apply,
    callout,
    previewContent: preview,
    onDelete: () => {
      props.onSnapshotChange(removeFrameCallout(props.snapshot, props.calloutIndex));
      setIsEditing(false);
    },
    onSettingsClick: () => {
      if (settingsAnchorRef.current) props.onSettingsOpen(settingsAnchorRef.current);
    },
    onStartEditing: () => setIsEditing(true),
    onStopEditing: stopEditing,
  });
  const surface = resolveFrameSurface(props.snapshot);
  const settings = {
    ...callout,
    style: resolveCalloutColorBindings(
      callout.style,
      getCalloutFrameColors(props.snapshot.borderSettings)
    ),
  };
  return (
    <>
      <FrameCalloutInteractiveSurface
        chromeScale={1}
        coordinateSpace={props.coordinateSpace}
        {...(props.controlsPortalTarget
          ? { controlsPortalTarget: props.controlsPortalTarget }
          : {})}
        editing={{
          ...editing,
          events: { ...editing.events, blur: handleEditingBlur },
          layout: { ...editing.layout, floatingToolbarRect: null },
        }}
        frameBorderWidth={surface.strokeVisible ? surface.geometry.strokeWidth : 0}
        frameId={props.snapshot.id}
        frameRect={props.snapshot}
        isEditing={isEditing}
        isFrameEditing={false}
        {...(props.onMoveEnd ? { onMoveEnd: props.onMoveEnd } : {})}
        isSettingsOpen={props.isSettingsOpen}
        {...actions}
        portalTarget={props.portalTarget}
        portalTheme={null}
        {...(props.projectMoveRect ? { projectMoveRect: props.projectMoveRect } : {})}
        renderVoiceSlot={({ calloutLeft, calloutWidth, viewportWidth }) => (
          <CalloutVoiceButton
            dataUi="editor.frame-annotation.callout-voice-input"
            isEditing={isEditing}
            leftOffset={resolveCalloutVoiceButtonLeftOffset({
              calloutLeft,
              calloutWidth,
              viewportWidth,
            })}
            voice={voice}
          />
        )}
        settings={settings}
        settingsAnchorRef={settingsAnchorRef}
        showSettingsHandle
        zIndex={props.snapshot.ordering + 1}
      />
    </>
  );
}

export function resolveCalloutCenter(
  frameId: string,
  coordinateSpace: FrameAnnotationCoordinateSpace,
  calloutIndex = 0
): { x: number; y: number } | null {
  const callout = Array.from(document.querySelectorAll<HTMLElement>('.sniptale-callout')).filter(
    (element) => element.dataset['frameId'] === frameId
  )[calloutIndex];
  const rect = callout?.getBoundingClientRect();
  if (!rect) return null;
  const logical = coordinateSpace.clientRectToLogical({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  });
  return { x: logical.x + logical.width / 2, y: logical.y + logical.height / 2 };
}
