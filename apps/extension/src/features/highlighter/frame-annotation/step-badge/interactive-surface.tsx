import React from 'react';
import { translate } from '../../../../platform/i18n';
import { createPortal } from 'react-dom';
import type { AppTheme } from '@sniptale/ui/theme/types';
import type {
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { FrameStepBadgeSurface } from '../step-badge-surface';
import type { FrameAnnotationCoordinateSpace } from '../coordinate-space';
import { useStepBadgeInteraction } from './interaction';
import type { StepBadgeFrameRect } from './placement';
import { FrameStepBadgeControls } from './controls';
import { FRAME_ANNOTATION_Z_INDEX } from '../interaction/z-index';

export function FrameStepBadgeInteractiveSurface(props: {
  borderColor: string;
  borderWidth: number;
  chromeScale?: number;
  controlsPortalTarget: Element | DocumentFragment;
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  fillColor?: string;
  frameRect: StepBadgeFrameRect;
  isSettingsOpen?: boolean;
  onClick?: () => void;
  onPositionChange?: (placement: StepBadgeManualPlacement) => void;
  onFramePositionChange?: (point: { x: number; y: number }) => void;
  onSettingsClick?: () => void;
  onValueChange?: (value: string) => void;
  portalTheme: AppTheme | null;
  settings: StepBadgeSettings;
  settingsAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  shadow?: number;
  showSettingsHandle: boolean;
  surfacePortalTarget: Element | DocumentFragment;
  chrome?: 'export' | 'interactive';
}) {
  const [isEditingValue, setIsEditingValue] = React.useState(false);
  const editAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const interaction = useStepBadgeInteraction({
    canEditValue: Boolean(props.onValueChange),
    borderWidth: props.borderWidth,
    ...(props.chromeScale === undefined ? {} : { chromeScale: props.chromeScale }),
    ...(props.coordinateSpace ? { coordinateSpace: props.coordinateSpace } : {}),
    frameRect: props.frameRect,
    isSettingsOpen: isEditingValue || props.isSettingsOpen,
    onPositionChange: props.onPositionChange,
    ...(props.onFramePositionChange ? { onFramePositionChange: props.onFramePositionChange } : {}),
    settings: props.settings,
  });
  if (!props.settings.enabled) return null;
  const frameRect = interaction.effectiveFrameRect ?? props.frameRect;
  const badge = (
    <FrameStepBadgeSurface
      borderColor={props.borderColor}
      borderWidth={props.borderWidth}
      elementRef={interaction.badgeRef}
      {...(isEditingValue && props.chrome !== 'export' && props.onValueChange
        ? {
            valueEditor: (
              <StepBadgeInlineValueEditor
                value={String(props.settings.value ?? '')}
                onFinish={(value, restoreFocus) => {
                  setIsEditingValue(false);
                  if (value !== null) props.onValueChange?.(value);
                  if (restoreFocus) editAnchorRef.current?.focus();
                }}
              />
            ),
          }
        : {})}
      isDragging={interaction.drag.isDragging}
      {...(props.onClick ? { onClick: props.onClick } : {})}
      onMouseEnter={interaction.visibility.handleMouseEnter}
      onMouseLeave={interaction.visibility.handleMouseLeave}
      settings={interaction.effectiveSettings}
      zIndex={0}
      {...(props.chrome === 'export' || props.chromeScale === undefined
        ? {}
        : { visualScale: props.chromeScale })}
      {...(props.fillColor ? { fillColor: props.fillColor } : {})}
      {...(props.shadow === undefined ? {} : { shadow: props.shadow })}
    />
  );
  return (
    <>
      {createPortal(
        <div
          className="sniptale-step-badge-layer"
          style={{
            position: 'fixed',
            top: frameRect.y,
            left: frameRect.x,
            width: frameRect.width,
            height: frameRect.height,
            pointerEvents: 'none',
            zIndex: FRAME_ANNOTATION_Z_INDEX.stepBadge,
          }}
        >
          {badge}
        </div>,
        props.surfacePortalTarget
      )}
      {props.chrome !== 'export' ? (
        <FrameStepBadgeControls
          drag={interaction.drag}
          editAnchorRef={editAnchorRef}
          isEditingValue={isEditingValue}
          {...(props.onValueChange ? { onEditValue: () => setIsEditingValue(true) } : {})}
          visibility={interaction.visibility}
          portalTarget={props.controlsPortalTarget}
          portalTheme={props.portalTheme}
          position={interaction.controlPosition}
          showSettingsHandle={props.showSettingsHandle}
          {...(props.onSettingsClick ? { onSettingsClick: props.onSettingsClick } : {})}
          {...(props.settingsAnchorRef ? { settingsAnchorRef: props.settingsAnchorRef } : {})}
        />
      ) : null}
    </>
  );
}

function StepBadgeInlineValueEditor(props: {
  value: string;
  onFinish: (value: string | null, restoreFocus: boolean) => void;
}) {
  const [draft, setDraft] = React.useState(props.value.slice(0, 2));
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const finishedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const finish = (accept: boolean, restoreFocus: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const value = draft.trim();
    props.onFinish(accept && value ? value : null, restoreFocus);
  };
  React.useEffect(() => {
    const input = inputRef.current;
    const owner = input?.ownerDocument.defaultView;
    if (!input || !owner) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!event.composedPath().includes(input)) finish(true, false);
    };
    owner.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => owner.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  });
  return (
    <input
      ref={inputRef}
      className="sniptale-step-badge-value-editor"
      aria-label={translate('content.stepBadge.editValue')}
      autoComplete="off"
      spellCheck={false}
      maxLength={2}
      value={draft}
      onChange={(event) => setDraft(event.target.value.slice(0, 2))}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          finish(event.key === 'Enter', true);
        }
      }}
      onBlur={() => finish(true, false)}
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        minWidth: 0,
        padding: 0,
        border: 0,
        borderRadius: 'inherit',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        lineHeight: 1,
        textAlign: 'center',
        outline: '2px solid var(--sniptale-color-accent)',
        outlineOffset: -2,
        caretColor: 'currentColor',
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}
    />
  );
}
