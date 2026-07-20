import React from 'react';
import {
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';
import { Droplet, Focus, ListOrdered, MessageSquare, Pencil, Square, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { InteractiveFrameToolbarProps } from './types';

function EffectIcon(props: { mode: 'border' | 'blur' | 'focus' }) {
  if (props.mode === 'border') {
    return <Square size={18} />;
  }
  if (props.mode === 'blur') {
    return <Droplet size={18} />;
  }
  return <Focus size={18} />;
}

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
    <>
      {props.effectButtons.map(({ mode, label }) => {
        const isActive = props.effectMode === mode;
        return (
          <ProductGlassToolbarButton
            key={mode}
            ref={
              isActive ? (props.popoverAnchorRef as React.RefObject<HTMLButtonElement>) : undefined
            }
            onClick={props.handleEffectClick(mode)}
            onMouseDown={props.handleButtonMouseDown}
            menuIndicator
            title={
              label + (isActive ? translate('content.interactiveFrame.effectActiveSuffix') : '')
            }
            active={isActive}
          >
            <EffectIcon mode={mode} />
          </ProductGlassToolbarButton>
        );
      })}
    </>
  );
}

function InteractiveFrameToolbarStepButton(props: {
  frame: InteractiveFrameToolbarProps['frame'];
  stepBadgePopoverAnchorRef: InteractiveFrameToolbarProps['stepBadgePopoverAnchorRef'];
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleStepBadgeClick: (event: React.MouseEvent) => void;
}) {
  return (
    <ProductGlassToolbarButton
      ref={props.stepBadgePopoverAnchorRef as React.RefObject<HTMLButtonElement>}
      onClick={props.handleStepBadgeClick}
      onMouseDown={props.handleButtonMouseDown}
      menuIndicator
      title={
        props.frame.stepBadge?.enabled
          ? translate('content.interactiveFrame.stepBadgeEnabled')
          : translate('content.interactiveFrame.stepBadgeEnable')
      }
      {...(props.frame.stepBadge?.enabled ? { active: true } : {})}
    >
      <ListOrdered size={17} />
    </ProductGlassToolbarButton>
  );
}

function InteractiveFrameToolbarCalloutButton(props: {
  frame: InteractiveFrameToolbarProps['frame'];
  calloutPopoverAnchorRef: InteractiveFrameToolbarProps['calloutPopoverAnchorRef'];
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleCalloutClick: (event: React.MouseEvent) => void;
}) {
  return (
    <ProductGlassToolbarButton
      ref={props.calloutPopoverAnchorRef as React.RefObject<HTMLButtonElement>}
      onClick={props.handleCalloutClick}
      onMouseDown={props.handleButtonMouseDown}
      menuIndicator
      title={
        props.frame.callout?.enabled
          ? translate('content.interactiveFrame.calloutEdit')
          : translate('content.interactiveFrame.calloutAdd')
      }
      {...(props.frame.callout?.enabled ? { active: true } : {})}
    >
      <MessageSquare size={17} />
    </ProductGlassToolbarButton>
  );
}

export function InteractiveFrameToolbarActionButtons(props: {
  handleButtonMouseDown: (event: React.MouseEvent) => void;
  handleEditClick: (event: React.MouseEvent) => void;
  handleDeleteClick: (event: React.MouseEvent) => void;
}) {
  return (
    <>
      <ProductGlassToolbarDivider />
      <ProductGlassToolbarButton
        onClick={props.handleEditClick}
        onMouseDown={props.handleButtonMouseDown}
        title={translate('content.interactiveFrame.editButton')}
      >
        <Pencil size={18} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        onClick={props.handleDeleteClick}
        onMouseDown={props.handleButtonMouseDown}
        danger
        title={translate('content.interactiveFrame.deleteButton')}
      >
        <Trash2 size={18} />
      </ProductGlassToolbarButton>
    </>
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
  return (
    <>
      <ProductGlassToolbarDivider />
      <InteractiveFrameToolbarStepButton
        frame={props.frame}
        stepBadgePopoverAnchorRef={props.stepBadgePopoverAnchorRef}
        handleButtonMouseDown={props.handleButtonMouseDown}
        handleStepBadgeClick={props.handleStepBadgeClick}
      />
      <InteractiveFrameToolbarCalloutButton
        frame={props.frame}
        calloutPopoverAnchorRef={props.calloutPopoverAnchorRef}
        handleButtonMouseDown={props.handleButtonMouseDown}
        handleCalloutClick={props.handleCalloutClick}
      />
    </>
  );
}
