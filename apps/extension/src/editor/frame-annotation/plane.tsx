import React from 'react';
import { createPortal } from 'react-dom';
import { resolveThemeSafePortalTarget } from '@sniptale/ui/theme/safe-portal';
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
import { EditorCropOverlay } from './crop-overlay';
import { getEditorDocumentClientRect } from '../controller/viewport/editing-surface';

type FrameSettingsSession = {
  anchor: HTMLButtonElement;
  frameId: string;
  menu: Exclude<ProjectionSettingsMenu, null>;
};

function useLockedSettingsSessionCleanup(args: {
  projected: ReturnType<typeof useFrameAnnotationInteraction>['projection']['projected'];
  session: FrameSettingsSession | null;
  setSession: React.Dispatch<React.SetStateAction<FrameSettingsSession | null>>;
}) {
  const { projected, session, setSession } = args;
  React.useEffect(() => {
    if (!session) return;
    const entry = projected.find((candidate) => candidate.snapshot.id === session.frameId);
    if (!entry || entry.object?.sniptaleLocked === true) setSession(null);
  }, [projected, session, setSession]);
}

function FrameEffectSurfaces(props: {
  documentSize: { width: number; height: number };
  projection: ReturnType<typeof useFrameAnnotationInteraction>['projection'];
}) {
  const { documentSize, projection } = props;
  return (
    <>
      {projection.distortionScale > 0 ? (
        <FrameAnnotationDistortionFilter scale={projection.distortionScale} />
      ) : null}
      {projection.focusFrames.length > 0 ? (
        <FrameAnnotationFocusSurface
          blurAmount={projection.focusBlurAmount}
          edgeOverscan={1 / Math.max(0.01, projection.scale)}
          frames={projection.focusFrames}
          height={documentSize.height}
          opacity={projection.focusOpacity}
          width={documentSize.width}
        />
      ) : null}
    </>
  );
}

export function EditorFrameAnnotationPlane(props: {
  activeTool: EditorTool;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  controller: EditorFrameAnnotationPlaneController;
  layers: EditorLayerItem[];
}) {
  const [settingsSession, setSettingsSession] = React.useState<FrameSettingsSession | null>(null);
  const interaction = useFrameAnnotationInteraction(props);
  const documentSize = props.controller.canvasDocumentSize ?? { width: 1, height: 1 };
  const planeRef = React.useRef<HTMLDivElement | null>(null);
  const [sceneRoot, setSceneRoot] = React.useState<HTMLDivElement | null>(null);
  const [controlsRoot, setControlsRoot] = React.useState<HTMLDivElement | null>(null);
  const canvasRect = useProjectionRect(props.canvasRef);
  const planeRect = useProjectionRect(planeRef);
  const documentRect = getEditorDocumentClientRect(
    props.canvasRef.current,
    documentSize,
    props.controller.canvas
  );
  const coordinateSpace = useEditorFrameCoordinateSpace({
    canvasRect: documentRect,
    scale: interaction.projection.scale,
    viewport: documentSize,
  });
  useLockedSettingsSessionCleanup({
    projected: interaction.projection.projected,
    session: settingsSession,
    setSession: setSettingsSession,
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
      style={{ pointerEvents: props.activeTool === 'frame-annotation' ? 'auto' : 'none' }}
    >
      <div
        ref={setSceneRoot}
        data-ui="editor.frame-annotation-scene"
        style={{
          height: documentSize.height,
          width: documentSize.width,
          position: 'absolute',
          left: (documentRect?.left ?? canvasRect?.left ?? 0) - (planeRect?.left ?? 0),
          top: (documentRect?.top ?? canvasRect?.top ?? 0) - (planeRect?.top ?? 0),
          transform: `scale(${interaction.projection.scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        <FrameEffectSurfaces documentSize={documentSize} projection={interaction.projection} />
        {interaction.projection.projected.map((entry) => (
          <FrameProjection
            key={entry.snapshot.id}
            coordinateSpace={coordinateSpace}
            controlsRoot={controlsRoot}
            object={entry.object}
            sceneRoot={sceneRoot}
            selected={entry.snapshot.id === interaction.projection.effectiveSelectedId}
            interactive={
              entry.object?.sniptaleLocked !== true &&
              (props.activeTool === 'frame-annotation' || props.activeTool === 'select')
            }
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
        <EditorCropOverlay
          activeTool={props.activeTool}
          canvas={props.controller.canvas}
          documentSize={documentSize}
        />
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
        resolveThemeSafePortalTarget(null)
      )}
    </div>
  );
}
