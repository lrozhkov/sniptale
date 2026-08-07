import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import type {
  CalloutAttachment,
  CalloutCurveSettings,
  CalloutSettings,
} from '@sniptale/runtime-contracts/highlighter/callout';
import {
  FrameCalloutInteractiveSurface,
  createCalloutSettingsKey,
} from '../../../features/highlighter/frame-annotation/callout/interactive-surface';
import { resolveCalloutThemeOwner } from './dom';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { useCalloutEditing } from './editing';
import { CalloutVoiceButton, resolveCalloutVoiceButtonLeftOffset } from './voice-button';
import type { CalloutDragBehavior } from '../../../features/highlighter/frame-annotation/callout/drag';

interface CalloutProps {
  frameId: string;
  frameBorderWidth: number;
  settings: CalloutSettings;
  frameRect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  isEditing: boolean;
  isFrameEditing: boolean;
  isSettingsOpen: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onContentChange: (htmlContent: string) => void;
  onTitleChange: (titleText: string) => void;
  onDelete: () => void;
  onSettingsClick: () => void;
  onPositionChange: (
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>,
    behavior: CalloutDragBehavior
  ) => void;
  onTailBaseRangeChange: (position: number, width: number, attachment?: CalloutAttachment) => void;
  onTailFramePositionChange: (position: number, attachment?: CalloutAttachment) => void;
  onCurveChange: (curve: CalloutCurveSettings) => void;
  onWaypointChange: (waypoint: CalloutSettings['placement']['connectorWaypoint']) => void;
  onWidthChange: (
    maxWidth: number,
    placement: NonNullable<CalloutSettings['placement']['manualPlacement']>
  ) => void;
  settingsAnchorRef: React.RefObject<HTMLButtonElement | null>;
  showSettingsHandle: boolean;
}

/** Content adapter: page history, voice and the page-owned portal stay outside shared mechanics. */
export const Callout: React.FC<CalloutProps> = (props) => {
  useAppLocale();
  const portalTheme = useResolvedPortalTheme(resolveCalloutThemeOwner());
  const editing = useCalloutEditing({
    frameId: props.frameId,
    htmlContent: props.settings.content.bodyHtml,
    titleText: props.settings.content.titleText,
    isEditing: props.isEditing,
    onContentChange: props.onContentChange,
    onDelete: props.onDelete,
    onStartEditing: props.onStartEditing,
    onStopEditing: props.onStopEditing,
    settingsKey: createCalloutSettingsKey(props.settings),
  });

  return (
    <FrameCalloutInteractiveSurface
      editing={{
        events: {
          applyFormatting: editing.applyFormatting,
          blur: editing.handleBlur,
          click: editing.handleClick,
          input: editing.handleInput,
          keyDown: editing.handleKeyDown,
          paste: editing.handlePaste,
        },
        layout: {
          dimensions: editing.dimensions,
          floatingToolbarRect: editing.floatingToolbarRect,
        },
        refs: {
          container: editing.containerRef,
          contentEditable: editing.contentEditableRef,
        },
      }}
      frameBorderWidth={props.frameBorderWidth}
      frameId={props.frameId}
      frameRect={props.frameRect}
      isEditing={props.isEditing}
      isFrameEditing={props.isFrameEditing}
      isSettingsOpen={props.isSettingsOpen}
      onCurveChange={props.onCurveChange}
      onPositionChange={props.onPositionChange}
      onSettingsClick={props.onSettingsClick}
      onTailBaseRangeChange={props.onTailBaseRangeChange}
      onTailFramePositionChange={props.onTailFramePositionChange}
      onTitleChange={props.onTitleChange}
      onWaypointChange={props.onWaypointChange}
      onWidthChange={props.onWidthChange}
      portalTarget={resolveContentPortalTarget(resolveCalloutThemeOwner())}
      portalTheme={portalTheme}
      renderVoiceSlot={({ calloutLeft, calloutWidth, viewportWidth }) => (
        <CalloutVoiceButton
          isEditing={props.isEditing}
          leftOffset={resolveCalloutVoiceButtonLeftOffset({
            calloutLeft,
            calloutWidth,
            viewportWidth,
          })}
          voice={editing.voice}
        />
      )}
      settings={props.settings}
      settingsAnchorRef={props.settingsAnchorRef}
      showSettingsHandle={props.showSettingsHandle}
      zIndex={props.zIndex}
    />
  );
};
