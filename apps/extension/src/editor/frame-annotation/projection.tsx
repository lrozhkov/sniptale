import React from 'react';
import { createPortal } from 'react-dom';
import type { FabricObject } from 'fabric';
import {
  FrameAnnotationDecoration,
  resolveFrameAnnotationVisualScene,
  type FrameAnnotationSnapshotV1,
} from '../../features/highlighter/frame-annotation';
import { FrameAnnotationBlurSurface } from '../../features/highlighter/frame-annotation/effect-surface';
import {
  FrameAnnotationFloatingToolbar,
  FrameAnnotationToolbarAddCalloutButton,
} from '../../features/highlighter/frame-annotation/floating-toolbar';
import type { FrameAnnotationCommandId } from '../../features/highlighter/frame-annotation/commands';
import type { FrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';
import { FrameAnnotationResizeHandleLayer } from '../../features/highlighter/frame-annotation/interaction/resize-handles';
import type { ResizeDirection } from '../../features/highlighter/contracts';
import { FrameStepBadgeInteractiveSurface } from '../../features/highlighter/frame-annotation/step-badge/interactive-surface';
import { FrameProjectionReadOnlyOverlays } from './projection-read-only';
import { MIN_FRAME_SIZE } from './interaction-controller';
import { EditorFrameCallout, resolveCalloutCenter } from './callout-projection';
import {
  appendFrameCallout,
  canAppendFrameCallout,
  getFrameCallout,
  getFrameCalloutKey,
  getFrameCallouts,
  MAX_FRAME_CALLOUTS,
} from '../../features/highlighter/frame-annotation/callout/collection';
import { createDefaultFrameCallout } from '../../features/highlighter/frame-annotation/defaults';
import { translate } from '../../platform/i18n';
import { FrameProjectionSettings, type ProjectionSettingsMenu } from './projection-settings';
import { resolveFrameAnnotationToolbarPlacement } from './toolbar-placement';
import { getRepresentativeColor } from '@sniptale/foundation/paint';

export function FrameProjection(props: {
  coordinateSpace: FrameAnnotationCoordinateSpace;
  controlsRoot: HTMLDivElement | null;
  interactive: boolean;
  showVisualOverlays?: boolean;
  object: FabricObject | null;
  sceneRoot: HTMLDivElement | null;
  selected: boolean;
  scale: number;
  snapshot: FrameAnnotationSnapshotV1;
  settingsAnchor: HTMLButtonElement | null;
  settingsMenu: ProjectionSettingsMenu;
  onMoveStart: (event: React.PointerEvent) => void;
  onResizeStart: (
    event: React.PointerEvent,
    direction: ResizeDirection,
    calloutCenter: { x: number; y: number } | null
  ) => void;
  onCommand: (command: FrameAnnotationCommandId) => void;
  onSnapshotChange: (snapshot: FrameAnnotationSnapshotV1) => void;
  onSnapshotPreview: (snapshot: FrameAnnotationSnapshotV1) => void;
  onStepBadgeReorder: (direction: 'up' | 'down') => void;
  onDraftCommit: () => void;
  onMoveEnd?: () => void;
  onCloseSettings: () => void;
  projectMoveRect?: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  onOpenSettings: (menu: Exclude<ProjectionSettingsMenu, null>, anchor: HTMLButtonElement) => void;
}) {
  const [activeCalloutIndex, setActiveCalloutIndex] = React.useState(0);
  React.useEffect(() => {
    if (!getFrameCallout(props.snapshot, activeCalloutIndex)) setActiveCalloutIndex(0);
  }, [activeCalloutIndex, props.snapshot]);
  const toolbarSelected =
    props.interactive && props.selected && props.object?.sniptaleLocked !== true;
  const editingSelected = toolbarSelected && props.settingsMenu === null;
  const scene = resolveFrameAnnotationVisualScene({
    frame: props.snapshot,
    state: editingSelected ? 'editing' : 'idle',
  });
  const frameRect = {
    x: props.snapshot.x,
    y: props.snapshot.y,
    width: props.snapshot.width,
    height: props.snapshot.height,
  };
  return (
    <>
      <FrameProjectionVisual
        frameRect={frameRect}
        interactive={props.interactive}
        scene={scene}
        snapshot={props.snapshot}
        onMoveStart={props.onMoveStart}
      />
      {props.interactive ? (
        <FrameProjectionOverlays
          {...props}
          activeCalloutIndex={activeCalloutIndex}
          frameRect={frameRect}
          scene={scene}
          setActiveCalloutIndex={setActiveCalloutIndex}
        />
      ) : props.showVisualOverlays ? (
        <FrameProjectionReadOnlyOverlays
          coordinateSpace={props.coordinateSpace}
          controlsRoot={props.controlsRoot}
          scene={scene}
          sceneRoot={props.sceneRoot}
          snapshot={props.snapshot}
        />
      ) : null}
      {toolbarSelected && props.controlsRoot ? (
        <FrameProjectionToolbar
          controlsRoot={props.controlsRoot}
          open={(menu, anchor) => {
            if (menu === 'callout') setActiveCalloutIndex(0);
            props.onOpenSettings(menu, anchor);
          }}
          scene={scene}
          snapshot={props.snapshot}
          onCommand={props.onCommand}
          onAddCallout={(anchor) => {
            const next = appendFrameCallout(props.snapshot, createDefaultFrameCallout());
            if (!next) return;
            setActiveCalloutIndex(next.calloutIndex);
            props.onSnapshotChange(next.frame);
            props.onOpenSettings('callout', anchor);
          }}
        />
      ) : null}
      {props.interactive && props.controlsRoot ? (
        <FrameProjectionSettings
          activeCalloutIndex={activeCalloutIndex}
          anchor={props.settingsAnchor}
          controlsRoot={props.controlsRoot}
          menu={props.settingsMenu}
          scene={scene}
          snapshot={props.snapshot}
          close={props.onCloseSettings}
          onChange={props.onSnapshotChange}
          onPreview={props.onSnapshotPreview}
          onReorder={props.onStepBadgeReorder}
          onDraftCommit={props.onDraftCommit}
          {...(props.onMoveEnd ? { onMoveEnd: props.onMoveEnd } : {})}
        />
      ) : null}
    </>
  );
}

function FrameProjectionVisual(props: {
  frameRect: { x: number; y: number; width: number; height: number };
  interactive: boolean;
  scene: ReturnType<typeof resolveFrameAnnotationVisualScene>;
  snapshot: FrameAnnotationSnapshotV1;
  onMoveStart: (event: React.PointerEvent) => void;
}) {
  const pointerEvents = props.interactive ? 'auto' : 'none';
  return (
    <div
      data-frame-id={props.snapshot.id}
      onPointerDown={props.onMoveStart}
      style={{
        position: 'absolute',
        left: props.frameRect.x,
        top: props.frameRect.y,
        width: props.frameRect.width,
        height: props.frameRect.height,
        pointerEvents,
      }}
    >
      <div
        style={{ ...props.scene.frameStyle, position: 'relative', left: 0, top: 0, pointerEvents }}
      >
        {props.snapshot.effectMode === 'blur' ? (
          <FrameAnnotationBlurSurface frame={props.snapshot} />
        ) : null}
        <FrameAnnotationDecoration
          frameId={props.snapshot.id}
          fillStyle={props.scene.fillStyle}
          strokeStyle={props.scene.strokeStyle}
        />
      </div>
    </div>
  );
}

function FrameProjectionOverlays(
  props: Parameters<typeof FrameProjection>[0] & {
    activeCalloutIndex: number;
    frameRect: { x: number; y: number; width: number; height: number };
    scene: ReturnType<typeof resolveFrameAnnotationVisualScene>;
    setActiveCalloutIndex: React.Dispatch<React.SetStateAction<number>>;
  }
) {
  return (
    <>
      <FrameResizeOverlay {...props} />
      <FrameCalloutOverlay {...props} />
      <FrameStepBadgeOverlay {...props} />
    </>
  );
}

type FrameProjectionOverlayProps = Parameters<typeof FrameProjectionOverlays>[0];

function FrameResizeOverlay(props: FrameProjectionOverlayProps) {
  if (!props.selected || props.settingsMenu !== null || !props.controlsRoot) return null;
  return createPortal(
    <FrameAnnotationResizeHandleLayer
      borderColor={props.scene.borderColor}
      frameId={props.snapshot.id}
      frameRect={props.coordinateSpace.logicalRectToClient(props.frameRect)}
      handleSize={Math.min(16, Math.max(10, 8 + props.scene.borderWidth))}
      strokeWidth={props.scene.surface.strokeVisible ? props.scene.borderWidth * props.scale : 0}
      position="fixed"
      onResizeStart={(event, direction) =>
        props.onResizeStart(
          event,
          direction,
          resolveCalloutCenter(props.snapshot.id, props.coordinateSpace, props.activeCalloutIndex)
        )
      }
    />,
    props.controlsRoot
  );
}

function FrameCalloutOverlay(props: FrameProjectionOverlayProps) {
  if (!props.sceneRoot || !props.object) return null;
  const object = props.object;
  const sceneRoot = props.sceneRoot;
  return getFrameCallouts(props.snapshot).map((callout, calloutIndex) =>
    callout.enabled ? (
      <EditorFrameCallout
        calloutIndex={calloutIndex}
        coordinateSpace={props.coordinateSpace}
        object={object}
        portalTarget={sceneRoot}
        controlsPortalTarget={props.controlsRoot}
        selected={props.selected}
        snapshot={props.snapshot}
        onSnapshotChange={props.onSnapshotChange}
        onSnapshotPreview={props.onSnapshotPreview}
        onDraftCommit={props.onDraftCommit}
        isSettingsOpen={
          props.settingsMenu === 'callout' && props.activeCalloutIndex === calloutIndex
        }
        key={getFrameCalloutKey(props.snapshot, calloutIndex)}
        onSettingsOpen={(anchor) => {
          props.setActiveCalloutIndex(calloutIndex);
          props.onOpenSettings('callout', anchor);
        }}
        {...(props.projectMoveRect ? { projectMoveRect: props.projectMoveRect } : {})}
      />
    ) : null
  );
}

function FrameStepBadgeOverlay(props: FrameProjectionOverlayProps) {
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const settings = props.snapshot.stepBadge;
  if (!settings?.enabled || !props.sceneRoot || !props.controlsRoot) return null;
  return (
    <FrameStepBadgeInteractiveSurface
      borderColor={props.scene.borderColor}
      borderWidth={props.scene.borderWidth}
      controlsPortalTarget={props.controlsRoot}
      coordinateSpace={props.coordinateSpace}
      frameRect={props.frameRect}
      onPositionChange={(manualPlacement) =>
        props.onSnapshotChange({ ...props.snapshot, stepBadge: { ...settings, manualPlacement } })
      }
      portalTheme={null}
      isSettingsOpen={props.settingsMenu === 'step'}
      onSettingsClick={() => {
        if (anchorRef.current) props.onOpenSettings('step', anchorRef.current);
      }}
      settings={settings}
      settingsAnchorRef={anchorRef}
      showSettingsHandle
      surfacePortalTarget={props.sceneRoot}
      {...(props.snapshot.borderSettings?.fillPaint
        ? { fillColor: getRepresentativeColor(props.snapshot.borderSettings.fillPaint) }
        : {})}
      {...(props.snapshot.borderSettings?.shadow === undefined
        ? {}
        : { shadow: props.snapshot.borderSettings.shadow })}
    />
  );
}

function FrameProjectionToolbar(props: {
  controlsRoot: HTMLDivElement;
  open: (menu: Exclude<ProjectionSettingsMenu, null>, anchor: HTMLButtonElement) => void;
  scene: ReturnType<typeof resolveFrameAnnotationVisualScene>;
  snapshot: FrameAnnotationSnapshotV1;
  onCommand: (command: FrameAnnotationCommandId) => void;
  onAddCallout: (anchor: HTMLButtonElement) => void;
}) {
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [, refreshPlacement] = React.useReducer((value) => value + 1, 0);
  React.useLayoutEffect(() => {
    refreshPlacement();
    const onViewportChange = () => refreshPlacement();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    const chromeRoot = document.querySelector('[data-ui="editor.floating-workspace"]');
    const chromeObserver = new MutationObserver(onViewportChange);
    if (chromeRoot) chromeObserver.observe(chromeRoot, { childList: true, subtree: true });
    if (typeof ResizeObserver === 'undefined')
      return () => {
        chromeObserver.disconnect();
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
      };
    const observer = new ResizeObserver(() => refreshPlacement());
    const elements = [
      toolbarRef.current,
      document.querySelector('[data-ui="editor.floating.tool-rail.stack"]'),
      document.querySelector('[data-ui="editor.floating.document-bar"]'),
      document.querySelector('[data-ui="editor.floating.tool-properties"]'),
    ];
    for (const element of elements) if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      chromeObserver.disconnect();
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [props.snapshot.id]);
  const rail = document.querySelector('[data-ui="editor.floating.tool-rail.stack"]');
  const toolbarWidth = toolbarRef.current?.offsetWidth;
  const toolbarHeight = toolbarRef.current?.offsetHeight;
  const position = resolveFrameAnnotationToolbarPlacement({
    railBounds: rail?.getBoundingClientRect() ?? {
      bottom: 60,
      left: 0,
      right: window.innerWidth,
      top: 0,
    },
    obstacleBounds: [
      document.querySelector('[data-ui="editor.floating.document-bar"]'),
      document.querySelector('[data-ui="editor.floating.tool-properties"]'),
    ]
      .filter((element): element is Element => element !== null)
      .map((element) => element.getBoundingClientRect()),
    ...(toolbarWidth && toolbarHeight
      ? { toolbarSize: { height: toolbarHeight, width: toolbarWidth } }
      : {}),
    viewport: { height: window.innerHeight, width: window.innerWidth },
  });
  return createPortal(
    <div
      ref={toolbarRef}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: 'max-content',
        transform: `scale(${position.scale})`,
        transformOrigin: 'top left',
        zIndex: 50,
        pointerEvents: 'auto',
      }}
    >
      <FrameAnnotationFloatingToolbar
        calloutEnabled={props.snapshot.callout?.enabled}
        canDecrease={
          props.snapshot.width >= MIN_FRAME_SIZE + 10 &&
          props.snapshot.height >= MIN_FRAME_SIZE + 10
        }
        effectMode={props.snapshot.effectMode ?? 'border'}
        onCalloutSettingsClick={(anchor) => props.open('callout', anchor)}
        onEffectSettingsClick={(anchor) => props.open('effect', anchor)}
        onStepSettingsClick={(anchor) => props.open('step', anchor)}
        stepBadgeEnabled={props.snapshot.stepBadge?.enabled}
        showEdit={false}
        onCommand={props.onCommand}
        trailingSlot={
          props.snapshot.callout?.enabled ? (
            <FrameAnnotationToolbarAddCalloutButton
              disabled={!canAppendFrameCallout(props.snapshot)}
              title={translate('content.interactiveFrame.calloutAddAnother')}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!(event.currentTarget instanceof HTMLButtonElement)) return;
                const anchor =
                  getFrameCallouts(props.snapshot).length === MAX_FRAME_CALLOUTS - 1
                    ? (toolbarRef.current?.querySelector<HTMLButtonElement>(
                        'button:not(:disabled)'
                      ) ?? event.currentTarget)
                    : event.currentTarget;
                props.onAddCallout(anchor);
              }}
            />
          ) : null
        }
      />
    </div>,
    props.controlsRoot
  );
}
