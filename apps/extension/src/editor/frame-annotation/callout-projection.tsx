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
import type { FrameAnnotationToolbarBounds } from './toolbar-placement';
import {
  CalloutVoiceButton,
  resolveCalloutVoiceButtonLeftOffset,
} from '../../composition/frame-annotation-controls/voice/button';
import { useCalloutVoiceInput } from '../../composition/frame-annotation-controls/voice/input';

export function EditorFrameCallout(props: {
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
  onOccupiedBoundsChange: (bounds: FrameAnnotationToolbarBounds | null) => void;
  projectMoveRect?: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}) {
  const callout = props.snapshot.callout!;
  const [isEditing, setIsEditing] = React.useState(
    () => callout.content.bodyHtml.trim() === '' && callout.content.titleText.trim() === ''
  );
  const settingsAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const frameId = props.snapshot.id;
  const onOccupiedBoundsChange = props.onOccupiedBoundsChange;
  React.useLayoutEffect(() => {
    const measure = () => onOccupiedBoundsChange(measureCalloutOccupiedBounds(frameId));
    measure();
    const elements = getCalloutOccupiedElements(frameId);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    elements.forEach((element) => observer?.observe(element));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [frameId, onOccupiedBoundsChange, props.isSettingsOpen, props.selected]);
  const apply = (nextCallout: typeof callout) =>
    props.onSnapshotChange({ ...props.snapshot, callout: nextCallout });
  const preview = (nextCallout: typeof callout) =>
    props.onSnapshotPreview({ ...props.snapshot, callout: nextCallout });
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
    onDelete: () => apply({ ...callout, enabled: false }),
    onStartEditing: () => setIsEditing(true),
    onStopEditing: stopEditing,
    settingsKey: JSON.stringify(callout.style),
    stopVoiceInput: voice.actions.stop,
    titleText: callout.content.titleText,
    voiceActive: voice.state.active,
  });
  const actions = createFrameCalloutActions({
    apply,
    callout,
    previewContent: preview,
    onDelete: () => {
      apply({ ...callout, enabled: false });
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
        coordinateSpace={props.coordinateSpace}
        {...(props.controlsPortalTarget
          ? { controlsPortalTarget: props.controlsPortalTarget }
          : {})}
        editing={{
          ...editing,
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
        showSettingsHandle={!props.selected || props.isSettingsOpen}
        zIndex={props.snapshot.ordering + 1}
      />
    </>
  );
}

export function resolveCalloutCenter(
  frameId: string,
  coordinateSpace: FrameAnnotationCoordinateSpace
): { x: number; y: number } | null {
  const callout = Array.from(document.querySelectorAll<HTMLElement>('.sniptale-callout')).find(
    (element) => element.dataset['frameId'] === frameId
  );
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

function getCalloutOccupiedElements(frameId: string): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.sniptale-callout, [data-sniptale-callout-control-frame-id]'
    )
  ).filter(
    (element) =>
      element.dataset['frameId'] === frameId ||
      element.dataset['sniptaleCalloutControlFrameId'] === frameId
  );
}

function measureCalloutOccupiedBounds(frameId: string): FrameAnnotationToolbarBounds | null {
  const elements = getCalloutOccupiedElements(frameId).filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (elements.length === 0) return null;
  return elements.reduce<FrameAnnotationToolbarBounds | null>((bounds, element) => {
    const rect = element.getBoundingClientRect();
    if (!bounds) return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    return {
      bottom: Math.max(bounds.bottom, rect.bottom),
      left: Math.min(bounds.left, rect.left),
      right: Math.max(bounds.right, rect.right),
      top: Math.min(bounds.top, rect.top),
    };
  }, null);
}
