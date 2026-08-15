import React from 'react';
import { Eye, EyeOff, ListOrdered, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AddFrameCommentIcon, FrameCommentIcon } from './icons';
import {
  ProductGlassToolbar,
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';
import type { EffectMode } from '@sniptale/ui/highlighter-style/types';
import { getFrameAnnotationCommandSchema, type FrameAnnotationCommandId } from './commands';
import { FrameAnnotationEffectIcon } from './effect-icon';

function commandLabels() {
  return new Map(getFrameAnnotationCommandSchema().map((item) => [item.id, item.label]));
}

export function FrameAnnotationToolbarEffectButton(props: {
  effectMode: EffectMode;
  label?: string | undefined;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  return (
    <ProductGlassToolbarButton
      active
      data-sniptale-activation-bridge="defer"
      ref={props.anchorRef}
      onClick={props.onClick}
      onMouseDown={props.onMouseDown}
      menuIndicator
      title={props.label ?? commandLabels().get(`effect-${props.effectMode}`)}
    >
      <FrameAnnotationEffectIcon mode={props.effectMode} size={18} />
    </ProductGlassToolbarButton>
  );
}

type FrameAnnotationToolbarMenuButtonProps = {
  active: boolean;
  title?: string;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
  commandId: FrameAnnotationCommandId;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
};

function FrameAnnotationToolbarMenuButton(props: FrameAnnotationToolbarMenuButtonProps) {
  return (
    <ProductGlassToolbarButton
      active={props.active}
      data-sniptale-activation-bridge="defer"
      ref={props.anchorRef}
      onClick={props.onClick}
      onMouseDown={props.onMouseDown}
      menuIndicator
      title={props.title ?? commandLabels().get(props.commandId)}
    >
      {props.children}
    </ProductGlassToolbarButton>
  );
}

export function FrameAnnotationToolbarStepButton(props: {
  active: boolean;
  title?: string;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  return (
    <FrameAnnotationToolbarMenuButton {...props} commandId="step-badge">
      <ListOrdered size={17} />
    </FrameAnnotationToolbarMenuButton>
  );
}

export function FrameAnnotationToolbarCalloutButton(props: {
  active: boolean;
  title?: string;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  return (
    <FrameAnnotationToolbarMenuButton {...props} commandId="callout">
      <FrameCommentIcon size={17} />
    </FrameAnnotationToolbarMenuButton>
  );
}

export function FrameAnnotationToolbarAddCalloutButton(props: {
  disabled?: boolean;
  title: string;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
}) {
  return (
    <ProductGlassToolbarButton
      data-sniptale-activation-bridge="defer"
      data-ui="content.interactive-frame.add-callout"
      disabled={props.disabled}
      onClick={props.onClick}
      onMouseDown={props.onMouseDown}
      title={props.title}
    >
      <AddFrameCommentIcon size={17} />
    </ProductGlassToolbarButton>
  );
}

export function FrameAnnotationToolbarActionButtons(props: {
  canDecrease: boolean;
  onClose: (event: React.MouseEvent) => void;
  onDecrease: (event: React.MouseEvent) => void;
  onDelete: (event: React.MouseEvent) => void;
  onEdit: (event: React.MouseEvent) => void;
  onIncrease: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
  captureHidden?: boolean;
  captureVisibilityTitle?: string;
  onCaptureVisibilityChange?: (event: React.MouseEvent) => void;
  showEdit?: boolean;
}) {
  const labels = commandLabels();
  return (
    <>
      <ProductGlassToolbarDivider />
      <ProductGlassToolbarButton
        disabled={!props.canDecrease}
        onClick={props.onDecrease}
        onMouseDown={props.onMouseDown}
        title={labels.get('decrease')}
        aria-label={labels.get('decrease')}
      >
        <Minus size={18} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        onClick={props.onIncrease}
        onMouseDown={props.onMouseDown}
        title={labels.get('increase')}
        aria-label={labels.get('increase')}
      >
        <Plus size={18} />
      </ProductGlassToolbarButton>
      {props.showEdit !== false ? (
        <ProductGlassToolbarButton
          onClick={props.onEdit}
          onMouseDown={props.onMouseDown}
          title={labels.get('edit')}
        >
          <Pencil size={18} />
        </ProductGlassToolbarButton>
      ) : null}
      <ProductGlassToolbarDivider />
      {props.onCaptureVisibilityChange ? (
        <ProductGlassToolbarButton
          active={props.captureHidden === true}
          aria-pressed={props.captureHidden === true}
          data-ui="content.interactive-frame.capture-visibility"
          onClick={props.onCaptureVisibilityChange}
          onMouseDown={props.onMouseDown}
          title={props.captureVisibilityTitle}
        >
          {props.captureHidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </ProductGlassToolbarButton>
      ) : null}
      <ProductGlassToolbarButton
        danger
        onClick={props.onDelete}
        onMouseDown={props.onMouseDown}
        title={labels.get('delete')}
      >
        <Trash2 size={18} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarDivider />
      <ProductGlassToolbarButton
        onClick={props.onClose}
        onMouseDown={props.onMouseDown}
        title={labels.get('close')}
        aria-label={labels.get('close')}
      >
        <X size={18} />
      </ProductGlassToolbarButton>
    </>
  );
}

export function FrameAnnotationFloatingToolbar(props: {
  calloutEnabled?: boolean | undefined;
  canDecrease?: boolean;
  effectMode: EffectMode;
  stepBadgeEnabled?: boolean | undefined;
  onCommand(command: FrameAnnotationCommandId): void;
  onCalloutSettingsClick?: (anchor: HTMLButtonElement) => void;
  onEffectSettingsClick?: (anchor: HTMLButtonElement) => void;
  onStepSettingsClick?: (anchor: HTMLButtonElement) => void;
  showEdit?: boolean;
  trailingSlot?: React.ReactNode;
}) {
  const calloutAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const effectAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const stepAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const [effectMenuOpen, setEffectMenuOpen] = React.useState(false);
  const command = (id: FrameAnnotationCommandId) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEffectMenuOpen(false);
    props.onCommand(id);
  };
  const stopMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div style={{ position: 'relative', width: 'max-content' }}>
      <ProductGlassToolbar
        className="sniptale-action-toolbar"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <FrameAnnotationToolbarEffectButton
          anchorRef={effectAnchorRef}
          effectMode={props.effectMode}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (props.onEffectSettingsClick && effectAnchorRef.current) {
              setEffectMenuOpen(false);
              props.onEffectSettingsClick(effectAnchorRef.current);
              return;
            }
            setEffectMenuOpen((open) => !open);
          }}
          onMouseDown={stopMouseDown}
        />
        <ProductGlassToolbarDivider />
        <FrameAnnotationToolbarStepButton
          anchorRef={stepAnchorRef}
          active={props.stepBadgeEnabled === true}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (props.stepBadgeEnabled !== true) props.onCommand('step-badge');
            if (props.onStepSettingsClick && stepAnchorRef.current) {
              props.onStepSettingsClick(stepAnchorRef.current);
            }
          }}
          onMouseDown={stopMouseDown}
        />
        <FrameAnnotationToolbarCalloutButton
          anchorRef={calloutAnchorRef}
          active={props.calloutEnabled === true}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (props.calloutEnabled !== true) props.onCommand('callout');
            if (props.onCalloutSettingsClick && calloutAnchorRef.current) {
              props.onCalloutSettingsClick(calloutAnchorRef.current);
            }
          }}
          onMouseDown={stopMouseDown}
        />
        <FrameAnnotationToolbarActionButtons
          canDecrease={props.canDecrease !== false}
          onClose={command('close')}
          onDecrease={command('decrease')}
          onDelete={command('delete')}
          onEdit={command('edit')}
          onIncrease={command('increase')}
          onMouseDown={stopMouseDown}
          {...(props.showEdit === undefined ? {} : { showEdit: props.showEdit })}
        />
        {props.trailingSlot}
      </ProductGlassToolbar>
      {effectMenuOpen ? (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 2 }}>
          <ProductGlassToolbar className="sniptale-action-toolbar">
            {(['border', 'blur', 'focus'] as const).map((mode) => (
              <ProductGlassToolbarButton
                active={props.effectMode === mode}
                key={mode}
                onClick={command(`effect-${mode}`)}
                title={commandLabels().get(`effect-${mode}`)}
              >
                <FrameAnnotationEffectIcon mode={mode} size={18} />
              </ProductGlassToolbarButton>
            ))}
          </ProductGlassToolbar>
        </div>
      ) : null}
    </div>
  );
}
