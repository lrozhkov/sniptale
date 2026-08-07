import React from 'react';
import { ProductGlassToolbarDivider } from '@sniptale/ui/product-glass-toolbar';
import { translate } from '../../../../platform/i18n';
import type { InteractiveFrameToolbarProps } from './types';
import {
  FrameAnnotationToolbarActionButtons,
  FrameAnnotationToolbarCalloutButton,
  FrameAnnotationToolbarEffectButton,
  FrameAnnotationToolbarStepButton,
} from '../../../../features/highlighter/frame-annotation/floating-toolbar';

export function InteractiveFrameToolbarEffectButtons(props: {
  effectMode: InteractiveFrameToolbarProps['effectMode'];
  popoverAnchorRef: InteractiveFrameToolbarProps['popoverAnchorRef'];
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleEffectClick: (
    mode: InteractiveFrameToolbarProps['effectMode']
  ) => (event: React.MouseEvent) => void;
  effectButtons: Array<{ mode: InteractiveFrameToolbarProps['effectMode']; label: string }>;
}) {
  return (
    <FrameAnnotationToolbarEffectButton
      anchorRef={props.popoverAnchorRef}
      effectMode={props.effectMode}
      label={props.effectButtons.find((item) => item.mode === props.effectMode)?.label}
      onClick={props.handleEffectClick(props.effectMode)}
      onMouseDown={props.handleButtonMouseDown}
    />
  );
}

export function InteractiveFrameToolbarActionButtons(props: {
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleEditClick: (event: React.MouseEvent) => void;
  handleDeleteClick: (event: React.MouseEvent) => void;
  handleCloseClick: (event: React.MouseEvent) => void;
  handleDecreaseClick: (event: React.MouseEvent) => void;
  handleIncreaseClick: (event: React.MouseEvent) => void;
  canDecrease: boolean;
}) {
  return (
    <FrameAnnotationToolbarActionButtons
      canDecrease={props.canDecrease}
      onClose={props.handleCloseClick}
      onDecrease={props.handleDecreaseClick}
      onDelete={props.handleDeleteClick}
      onEdit={props.handleEditClick}
      onIncrease={props.handleIncreaseClick}
      onMouseDown={props.handleButtonMouseDown}
    />
  );
}

export function InteractiveFrameToolbarMiddleSection(props: {
  frame: InteractiveFrameToolbarProps['frame'];
  stepBadgePopoverAnchorRef: InteractiveFrameToolbarProps['stepBadgePopoverAnchorRef'];
  calloutPopoverAnchorRef: InteractiveFrameToolbarProps['calloutPopoverAnchorRef'];
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleStepBadgeClick: (event: React.MouseEvent) => void;
  handleCalloutClick: (event: React.MouseEvent) => void;
}) {
  const stepEnabled = props.frame.stepBadge?.enabled === true;
  const calloutEnabled = props.frame.callout?.enabled === true;
  return (
    <>
      <ProductGlassToolbarDivider />
      <FrameAnnotationToolbarStepButton
        active={stepEnabled}
        anchorRef={props.stepBadgePopoverAnchorRef}
        onClick={props.handleStepBadgeClick}
        onMouseDown={props.handleButtonMouseDown}
        title={translate(
          stepEnabled
            ? 'content.interactiveFrame.stepBadgeEnabled'
            : 'content.interactiveFrame.stepBadgeEnable'
        )}
      />
      <FrameAnnotationToolbarCalloutButton
        active={calloutEnabled}
        anchorRef={props.calloutPopoverAnchorRef}
        onClick={props.handleCalloutClick}
        onMouseDown={props.handleButtonMouseDown}
        title={translate(
          calloutEnabled
            ? 'content.interactiveFrame.calloutEdit'
            : 'content.interactiveFrame.calloutAdd'
        )}
      />
    </>
  );
}
