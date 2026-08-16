import React, { type ReactNode } from 'react';
import type { AppTheme } from '@sniptale/ui/theme/types';
import type {
  CalloutAttachment,
  CalloutCurveSettings,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { CalloutBody } from './surface';
import { createCalloutSettingsKey } from './settings-key';
import { useCalloutInteractionLayout } from './interaction-layout';
import type { CalloutHandleKeyboardEvent } from './keyboard';
import type { CalloutDragBehavior } from './drag';
import { createCalloutHandleStyles } from './handle-styles';
import {
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';
import {
  getFrameCalloutFontProbeText,
  loadFrameCalloutHandwrittenFont,
  requiresFrameCalloutHandwrittenFont,
} from './font-readiness';
import { installFrameCalloutHandwrittenFont } from './font-installer';

type FrameCalloutEditingModel = {
  events: {
    applyFormatting: React.ComponentProps<typeof CalloutBody>['applyFormatting'];
    blur: React.ComponentProps<typeof CalloutBody>['handleBlur'];
    click: React.ComponentProps<typeof CalloutBody>['handleClick'];
    finish: React.ComponentProps<typeof CalloutBody>['onBadgeEditingFinish'];
    input: React.ComponentProps<typeof CalloutBody>['handleInput'];
    keyDown: React.ComponentProps<typeof CalloutBody>['handleKeyDown'];
    paste: React.ComponentProps<typeof CalloutBody>['handlePaste'];
  };
  layout: { dimensions: { width: number; height: number }; floatingToolbarRect: DOMRect | null };
  refs: {
    container: React.RefObject<HTMLDivElement | null>;
    contentEditable: React.RefObject<HTMLDivElement | null>;
  };
};

export type FrameCalloutInteractiveSurfaceProps = {
  chrome?: 'export' | 'interactive';
  chromeScale: number;
  controlsPortalTarget?: Element | DocumentFragment;
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  editing: FrameCalloutEditingModel;
  frameBorderWidth: number;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isEditing: boolean;
  isFrameEditing: boolean;
  isSettingsOpen: boolean;
  onContentChange?: (htmlContent: string) => void;
  onBadgeTextChange: (text: string) => void;
  onMoveEnd?: () => void;
  onCurveChange: (curve: CalloutCurveSettings) => void;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    behavior: CalloutDragBehavior
  ) => void;
  onSettingsClick: () => void;
  onStartEditing: () => void;
  onTailBaseRangeChange: (position: number, width: number, attachment?: CalloutAttachment) => void;
  onTailFramePositionChange: (position: number, attachment?: CalloutAttachment) => void;
  onTitleChange: (titleText: string) => void;
  onTitleEnabledChange: (enabled: boolean) => void;
  onWaypointChange: (waypoint: CalloutSettings['placement']['connectorWaypoint']) => void;
  onWidthChange: (
    maxWidth: number,
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
  ) => void;
  portalTarget: Element | DocumentFragment;
  portalTheme: AppTheme | null;
  projectMoveRect?: (rect: { x: number; y: number; width: number; height: number }) => {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  renderVoiceSlot?: (layout: {
    calloutLeft: number;
    calloutWidth: number;
    viewportWidth: number;
  }) => ReactNode;
  settings: CalloutSettings;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
  zIndex: number;
};

export function FrameCalloutInteractiveSurface(props: FrameCalloutInteractiveSurfaceProps) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [titleFocusRequested, setTitleFocusRequested] = React.useState(false);
  const [, markFontReady] = React.useReducer((revision) => revision + 1, 0);
  React.useEffect(() => {
    if (!requiresFrameCalloutHandwrittenFont(props.settings)) return;
    const owner = wrapperRef.current?.ownerDocument;
    if (!owner) return;
    let current = true;
    void installFrameCalloutHandwrittenFont(owner)
      .then(() =>
        loadFrameCalloutHandwrittenFont(owner, getFrameCalloutFontProbeText(props.settings))
      )
      .then((loaded) => {
        if (current && loaded) markFontReady();
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [props.settings]);
  React.useEffect(() => {
    if (!titleFocusRequested || !props.isEditing || !props.settings.style.title.enabled) return;
    const ownerWindow = wrapperRef.current?.ownerDocument.defaultView ?? window;
    const focusFrameId = ownerWindow.requestAnimationFrame(() => {
      const input = wrapperRef.current?.querySelector<HTMLInputElement>(
        '[data-sniptale-callout-title="true"]'
      );
      if (!input || input.readOnly) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      setTitleFocusRequested(false);
    });
    return () => ownerWindow.cancelAnimationFrame(focusFrameId);
  }, [props.isEditing, props.settings.style.title.enabled, titleFocusRequested]);
  const coordinateSpace = props.coordinateSpace ?? identityFrameAnnotationCoordinateSpace;
  const visualScale = props.chrome === 'export' ? 1 : props.chromeScale;
  const interaction = useCalloutInteractionLayout({
    coordinateSpace,
    dimensions: {
      width: props.editing.layout.dimensions.width * visualScale,
      height: props.editing.layout.dimensions.height * visualScale,
    },
    frameBorderWidth: props.frameBorderWidth,
    frameRect: props.frameRect,
    isEditing: props.isEditing,
    isSettingsOpen: props.isSettingsOpen,
    onPositionChange: props.onPositionChange,
    ...(props.onMoveEnd ? { onMoveEnd: props.onMoveEnd } : {}),
    onTailBaseRangeChange: props.onTailBaseRangeChange,
    onTailFramePositionChange: props.onTailFramePositionChange,
    onCurveChange: props.onCurveChange,
    onWaypointChange: props.onWaypointChange,
    onWidthChange: props.onWidthChange,
    ...(props.projectMoveRect ? { projectMoveRect: props.projectMoveRect } : {}),
    settings: props.settings,
    visualScale,
    wrapperRef,
    zIndex: props.zIndex,
  });

  const bodyArgs = {
    props,
    interaction,
    coordinateSpace,
    requestTitleFocus: () => setTitleFocusRequested(true),
  };
  return <CalloutBody {...createCalloutBodyProps(bodyArgs)} wrapperRef={wrapperRef} />;
}

type BodyArgs = {
  coordinateSpace: FrameAnnotationCoordinateSpace;
  interaction: ReturnType<typeof useCalloutInteractionLayout>;
  props: FrameCalloutInteractiveSurfaceProps;
  requestTitleFocus: () => void;
};

function createCalloutHandleCallbacks(args: BodyArgs) {
  const { interaction } = args;
  return {
    handleSettingsClick: args.props.onSettingsClick,
    handleTitleToggleClick: () => {
      const enabled = args.interaction.effectiveSettings.style.title.enabled;
      args.props.onTitleEnabledChange(!enabled);
      if (!enabled) {
        args.requestTitleFocus();
        args.props.onStartEditing();
      }
    },
    handleDragPointerDown: interaction.handles.drag.handlePointerDown,
    handleDragKeyDown: interaction.handles.drag.handleKeyDown,
    handleHandleBlur: interaction.handles.drag.handleBlur,
    handleHandleFocus: interaction.handles.drag.handleFocus,
    handleTailPointerDown: interaction.handles.tailBaseStartDrag.handlePointerDown,
    handleTailKeyDown: interaction.handles.tailBaseStartDrag.handleKeyDown,
    handleTailBaseEndPointerDown: interaction.handles.tailBaseEndDrag.handlePointerDown,
    handleTailBaseEndKeyDown: interaction.handles.tailBaseEndDrag.handleKeyDown,
    handleTailBaseRangePointerDown: interaction.handles.tailBaseRangeDrag.handlePointerDown,
    handleTailBaseRangeKeyDown: interaction.handles.tailBaseRangeDrag.handleKeyDown,
    handleTailFramePointerDown: interaction.handles.tailFrameDrag.handlePointerDown,
    handleTailFrameKeyDown: interaction.handles.tailFrameDrag.handleKeyDown,
    handleWaypointPointerDown: interaction.handles.waypointDrag.handlePointerDown,
    handleWaypointKeyDown: interaction.handles.waypointDrag.handleKeyDown,
    handleWaypointDoubleClick: interaction.handles.waypointDrag.handleDoubleClick,
    handleCurveStartPointerDown: interaction.handles.curveStartDrag.handlePointerDown,
    handleCurveStartKeyDown: interaction.handles.curveStartDrag.handleKeyDown,
    handleCurveEndPointerDown: interaction.handles.curveEndDrag.handlePointerDown,
    handleCurveEndKeyDown: interaction.handles.curveEndDrag.handleKeyDown,
    handleMouseEnter: interaction.handles.drag.handleMouseEnter,
    handleMouseLeave: interaction.handles.drag.handleMouseLeave,
    handleResizeLeftPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      interaction.handles.widthResize.handlePointerDown('left', event),
    handleResizeLeftKeyDown: (event: CalloutHandleKeyboardEvent) =>
      interaction.handles.widthResize.handleKeyDown('left', event),
    handleResizeRightPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      interaction.handles.widthResize.handlePointerDown('right', event),
    handleResizeRightKeyDown: (event: CalloutHandleKeyboardEvent) =>
      interaction.handles.widthResize.handleKeyDown('right', event),
  };
}

function createCalloutHandleState(args: BodyArgs) {
  const { handles, layout } = args.interaction;
  const settings = args.interaction.effectiveSettings;
  return {
    isDragging: handles.drag.isDragging,
    isHandleVisible:
      handles.drag.isHandleVisible ||
      handles.tailBaseStartDrag.isDragging ||
      handles.tailBaseEndDrag.isDragging ||
      handles.tailBaseRangeDrag.isDragging ||
      handles.tailFrameDrag.isDragging ||
      handles.curveStartDrag.isDragging ||
      handles.curveEndDrag.isDragging ||
      handles.waypointDrag.isDragging ||
      handles.widthResize.isResizing,
    isResizingLeft: handles.widthResize.activeSide === 'left',
    isResizingRight: handles.widthResize.activeSide === 'right',
    isTailDragging: handles.tailBaseStartDrag.isDragging,
    isTailBaseEndDragging: handles.tailBaseEndDrag.isDragging,
    isTailBaseRangeDragging: handles.tailBaseRangeDrag.isDragging,
    isTailFrameDragging: handles.tailFrameDrag.isDragging,
    isWaypointDragging: handles.waypointDrag.isDragging,
    isCurveStartDragging: handles.curveStartDrag.isDragging,
    isCurveEndDragging: handles.curveEndDrag.isDragging,
    isPolylineWaypoint:
      settings.style.connector.kind === 'line' && settings.style.connector.routing === 'polyline',
    waypointAngle:
      layout.dynamicTail?.kind === 'line' ? layout.dynamicTail.routeControlAngle : null,
    hasWaypoint: settings.placement.connectorWaypoint !== undefined,
    isTitleEnabled: settings.style.title.enabled,
  };
}

function createCalloutBodyProps(args: BodyArgs) {
  const { editing } = args.props;
  const { layout } = args.interaction;
  const voiceSlot = args.props.renderVoiceSlot?.({
    calloutLeft: layout.calloutPos.x,
    calloutWidth: layout.calloutDimensions.width,
    viewportWidth: args.coordinateSpace.viewport.width,
  });
  return {
    applyFormatting: editing.events.applyFormatting,
    calloutDimensions: layout.calloutDimensions,
    cloudStyle: {
      ...layout.cloudStyle,
      ...(args.props.chrome === 'export'
        ? {}
        : { scale: args.props.chromeScale, transformOrigin: 'top left' }),
    },
    containerRef: editing.refs.container,
    contentEditableRef: editing.refs.contentEditable,
    editableStyle: layout.editableStyle,
    effectiveZIndex: layout.effectiveZIndex,
    floatingToolbarRect: editing.layout.floatingToolbarRect,
    frameId: args.props.frameId,
    handleBlur: editing.events.blur,
    handleClick: editing.events.click,
    handleInput: editing.events.input,
    handleKeyDown: editing.events.keyDown,
    handlePaste: editing.events.paste,
    portalTarget: args.props.portalTarget,
    controlsPortalTarget: args.props.controlsPortalTarget ?? args.props.portalTarget,
    ...(voiceSlot === undefined ? {} : { voiceSlot }),
    isEditing: args.props.isEditing,
    isGeometryHandleHidden: args.props.isSettingsOpen || args.props.isFrameEditing,
    isWidthResizeHandleHidden: args.props.isFrameEditing,
    portalTheme: args.props.portalTheme,
    settings: args.interaction.effectiveSettings,
    showInteractionChrome: args.props.chrome !== 'export',
    onTitleChange: args.props.onTitleChange,
    onBadgeTextChange: args.props.onBadgeTextChange,
    onBadgeEditingFinish: editing.events.finish,
    dynamicTail: layout.dynamicTail,
    settingsAnchorRef: args.props.settingsAnchorRef,
    showSettingsHandle: args.props.showSettingsHandle,
    visualScale: args.props.chrome === 'export' ? 1 : args.props.chromeScale,
    ...createCalloutHandleCallbacks(args),
    ...createCalloutHandleState(args),
    ...createCalloutHandleStyles({
      coordinateSpace: args.coordinateSpace,
      layout,
      showSettingsHandle: args.props.showSettingsHandle,
      uiScale: args.props.chromeScale,
      viewport: args.coordinateSpace.viewport,
    }),
    wrapperStyle: layout.wrapperStyle,
  };
}

export { createCalloutSettingsKey };
