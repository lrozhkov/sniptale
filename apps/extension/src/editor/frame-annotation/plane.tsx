import React from 'react';
import { createPortal } from 'react-dom';
import {
  FrameAnnotationDistortionFilter,
  FrameAnnotationFocusSurface,
} from '../../features/highlighter/frame-annotation/effect-surface';
import type { EditorLayerItem, EditorTool } from '../../features/editor/document/types';
import { useFrameAnnotationInteraction } from './interaction-controller';
import type { EditorFrameAnnotationPlaneController } from './types';
import { FrameProjection } from './projection';
import type { ProjectionSettingsMenu } from './projection-settings';
import { useEditorFrameCoordinateSpace, useProjectionRect } from './projection-space';

export function EditorFrameAnnotationPlane(props: {
  activeTool: EditorTool;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  controller: EditorFrameAnnotationPlaneController;
  layers: EditorLayerItem[];
}) {
  const [settingsSession, setSettingsSession] = React.useState<{
    anchor: HTMLButtonElement;
    frameId: string;
    menu: Exclude<ProjectionSettingsMenu, null>;
  } | null>(null);
  const interaction = useFrameAnnotationInteraction(props);
  const documentSize = props.controller.canvasDocumentSize ?? { width: 1, height: 1 };
  const planeRef = React.useRef<HTMLDivElement | null>(null);
  const [sceneRoot, setSceneRoot] = React.useState<HTMLDivElement | null>(null);
  const [controlsRoot, setControlsRoot] = React.useState<HTMLDivElement | null>(null);
  const canvasRect = useProjectionRect(props.canvasRef);
  const planeRect = useProjectionRect(planeRef);
  const coordinateSpace = useEditorFrameCoordinateSpace({
    canvasRect,
    scale: interaction.projection.scale,
    viewport: documentSize,
  });
  return (
    <div
      ref={planeRef}
      className="absolute inset-0 z-30 overflow-visible"
      data-ui="editor.frame-annotation-plane"
      onPointerDown={(event) => {
        if (
          event.target instanceof Node &&
          ((controlsRoot && controlsRoot.contains(event.target)) ||
            (event.target instanceof Element && event.target.closest('.sniptale-callout')))
        )
          return;
        interaction.planeEvents.pointerDown(event);
      }}
      onPointerMove={interaction.planeEvents.pointerMove}
      style={{ pointerEvents: props.activeTool === 'frame-annotation' ? 'auto' : 'none' }}
    >
      <div
        ref={setSceneRoot}
        data-ui="editor.frame-annotation-scene"
        style={{
          height: documentSize.height,
          width: documentSize.width,
          position: 'absolute',
          left: (canvasRect?.left ?? 0) - (planeRect?.left ?? 0),
          top: (canvasRect?.top ?? 0) - (planeRect?.top ?? 0),
          transform: `scale(${interaction.projection.scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {interaction.projection.distortionScale > 0 ? (
          <FrameAnnotationDistortionFilter scale={interaction.projection.distortionScale} />
        ) : null}
        {interaction.projection.focusFrames.length > 0 ? (
          <FrameAnnotationFocusSurface
            blurAmount={interaction.projection.focusBlurAmount}
            frames={interaction.projection.focusFrames}
            height={documentSize.height}
            opacity={interaction.projection.focusOpacity}
            width={documentSize.width}
          />
        ) : null}
        {interaction.projection.projected.map((entry) => (
          <FrameProjection
            key={entry.snapshot.id}
            coordinateSpace={coordinateSpace}
            controlsRoot={controlsRoot}
            object={entry.object}
            sceneRoot={sceneRoot}
            selected={entry.snapshot.id === interaction.projection.effectiveSelectedId}
            interactive={props.activeTool === 'frame-annotation' || props.activeTool === 'select'}
            scale={interaction.projection.scale}
            snapshot={entry.snapshot}
            settingsAnchor={
              settingsSession?.frameId === entry.snapshot.id ? settingsSession.anchor : null
            }
            settingsMenu={
              settingsSession?.frameId === entry.snapshot.id ? settingsSession.menu : null
            }
            onMoveStart={(event) => {
              if (entry.object)
                interaction.objectActions.startMove(entry.object, entry.snapshot, event);
            }}
            onResizeStart={(event, direction, calloutCenter) => {
              if (entry.object)
                interaction.objectActions.startResize(
                  entry.object,
                  entry.snapshot,
                  event,
                  direction,
                  calloutCenter
                );
            }}
            onCommand={(command) => {
              if (command === 'close' || command === 'delete') setSettingsSession(null);
              if (entry.object)
                interaction.objectActions.runCommand(entry.object, entry.snapshot, command);
            }}
            onSnapshotChange={(snapshot) => {
              if (entry.object) interaction.objectActions.commitSnapshot(entry.object, snapshot);
            }}
            onSnapshotPreview={(snapshot) => {
              if (entry.object) interaction.objectActions.previewSnapshot(entry.object, snapshot);
            }}
            onStepBadgeReorder={(direction) => {
              if (entry.object) interaction.objectActions.reorderStepBadge(entry.object, direction);
            }}
            onDraftCommit={interaction.objectActions.commitSnapshotDraft}
            onMoveEnd={() => props.controller.clearFrameAnnotationSnap?.()}
            onBringForward={() => props.controller.bringForwardSelection?.()}
            onSendBackward={() => props.controller.sendBackwardSelection?.()}
            onToggleLock={() => props.controller.toggleLayerLock?.(entry.snapshot.id)}
            projectMoveRect={(rect) =>
              props.controller.snapFrameAnnotationRect?.({
                excludeId: entry.snapshot.id,
                rect,
              }) ?? rect
            }
            onCloseSettings={() => setSettingsSession(null)}
            onOpenSettings={(menu, anchor) =>
              setSettingsSession({ anchor, frameId: entry.snapshot.id, menu })
            }
          />
        ))}
      </div>
      {createPortal(
        <div
          ref={setControlsRoot}
          data-ui="editor.frame-annotation-controls-root"
          style={{
            position: 'fixed',
            inset: 0,
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: 2_147_483_600,
          }}
        />,
        document.body
      )}
    </div>
  );
}
