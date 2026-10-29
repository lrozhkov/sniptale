import React from 'react';
import { ChevronDown, Eye, EyeOff, Minus, Move, Plus, Trash2, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { AddFrameCommentIcon, FrameCommentIcon, FrameNumberIcon } from './icons';
import {
  ProductGlassToolbar,
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';
import type { EffectMode } from '@sniptale/ui/highlighter-style/types';
import { getFrameAnnotationCommandSchema, type FrameAnnotationCommandId } from './commands';
import { FrameAnnotationEffectIcon } from './effect-icon';
import { translate } from '../../../platform/i18n';

function effectControlMarker(
  content: boolean | undefined,
  marker: string | undefined
): { dataUi?: string; 'data-ui'?: string } {
  if (!marker) return {};
  return content ? { dataUi: marker } : { 'data-ui': marker };
}

function commandLabels() {
  return new Map(getFrameAnnotationCommandSchema().map((item) => [item.id, item.label]));
}

export function FrameAnnotationToolbarEffectButton(props: {
  effectMode: EffectMode;
  label?: string | undefined;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
  onSelect: (mode: EffectMode, event: React.MouseEvent) => void;
  active?: boolean;
  contentContext?: boolean;
  disabled?: boolean;
  dataUi?: string;
  menuOpen?: boolean;
  menuSide?: string | undefined;
}) {
  const Button = props.contentContext ? ContentToolbarButton : ProductGlassToolbarButton;
  const labels = commandLabels();
  return (
    <div
      className="sniptale-annotation-effect-switch"
      role="group"
      aria-label={props.label ?? labels.get(`effect-${props.effectMode}`)}
    >
      <div className="sniptale-annotation-effect-options">
        {(['border', 'blur', 'focus'] as const).map((mode) => (
          <Button
            key={mode}
            active={props.active !== false && props.effectMode === mode}
            aria-pressed={props.active !== false && props.effectMode === mode}
            aria-label={labels.get(`effect-${mode}`)}
            title={labels.get(`effect-${mode}`)}
            disabled={props.disabled}
            data-frame-effect={mode}
            {...effectControlMarker(
              props.contentContext,
              props.effectMode === mode ? props.dataUi : undefined
            )}
            data-sniptale-activation-bridge="defer"
            onClick={(event) => props.onSelect(mode, event)}
            onMouseDown={props.onMouseDown}
          >
            <FrameAnnotationEffectIcon mode={mode} size={16} />
          </Button>
        ))}
      </div>
      <Button
        ref={props.anchorRef}
        className="sniptale-annotation-properties-arrow sniptale-full-page-chevron"
        aria-expanded={props.menuOpen}
        aria-haspopup="dialog"
        aria-label={translate('content.interactiveFrame.frameSettings')}
        title={translate('content.interactiveFrame.frameSettings')}
        disabled={props.disabled}
        {...effectControlMarker(
          props.contentContext,
          props.dataUi ? `${props.dataUi}.menu` : undefined
        )}
        data-menu-side={props.menuSide}
        data-sniptale-activation-bridge="defer"
        onClick={props.onClick}
        onMouseDown={props.onMouseDown}
      >
        <ChevronDown size={12} />
      </Button>
    </div>
  );
}

type FrameAnnotationToolbarMenuButtonProps = {
  active: boolean;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
  commandId: FrameAnnotationCommandId;
  onClick: (event: React.MouseEvent) => void;
  onMouseDown: (event: React.MouseEvent) => void;
  onToggle: (event: React.MouseEvent) => void;
};

function FrameAnnotationToolbarMenuButton(props: FrameAnnotationToolbarMenuButtonProps) {
  return (
    <div className="sniptale-annotation-menu-control">
      <ProductGlassToolbarButton
        active={props.active}
        data-sniptale-activation-bridge="defer"
        onClick={props.onToggle}
        onMouseDown={props.onMouseDown}
        aria-pressed={props.active}
        title={translate(
          props.commandId === 'callout'
            ? 'content.callout.settingsTitle'
            : 'content.stepBadge.settingsTitle'
        )}
        aria-label={translate(
          props.commandId === 'callout'
            ? 'content.callout.settingsTitle'
            : 'content.stepBadge.settingsTitle'
        )}
      >
        {props.children}
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        className="sniptale-annotation-properties-arrow sniptale-full-page-chevron"
        ref={props.anchorRef}
        title={translate(
          props.commandId === 'callout'
            ? 'content.interactiveFrame.calloutSettings'
            : 'content.interactiveFrame.stepBadgeSettings'
        )}
        aria-label={translate(
          props.commandId === 'callout'
            ? 'content.interactiveFrame.calloutSettings'
            : 'content.interactiveFrame.stepBadgeSettings'
        )}
        aria-haspopup="dialog"
        onClick={props.onClick}
        onMouseDown={props.onMouseDown}
        data-sniptale-activation-bridge="defer"
      >
        <ChevronDown size={12} />
      </ProductGlassToolbarButton>
    </div>
  );
}

type FrameAnnotationToolbarToggleProps = Omit<
  React.ComponentProps<typeof FrameAnnotationToolbarMenuButton>,
  'commandId' | 'children'
>;

export function FrameAnnotationToolbarStepButton(props: FrameAnnotationToolbarToggleProps) {
  return (
    <FrameAnnotationToolbarMenuButton {...props} commandId="step-badge">
      <FrameNumberIcon size={16} />
    </FrameAnnotationToolbarMenuButton>
  );
}

export function FrameAnnotationToolbarCalloutButton(props: FrameAnnotationToolbarToggleProps) {
  return (
    <FrameAnnotationToolbarMenuButton {...props} commandId="callout">
      <FrameCommentIcon size={16} />
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
      <AddFrameCommentIcon size={16} />
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
        <Minus size={16} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        onClick={props.onIncrease}
        onMouseDown={props.onMouseDown}
        title={labels.get('increase')}
        aria-label={labels.get('increase')}
      >
        <Plus size={16} />
      </ProductGlassToolbarButton>
      {props.showEdit !== false ? (
        <ProductGlassToolbarButton
          onClick={props.onEdit}
          onMouseDown={props.onMouseDown}
          title={labels.get('edit')}
        >
          <Move size={16} />
        </ProductGlassToolbarButton>
      ) : null}
      {props.onCaptureVisibilityChange ? (
        <>
          <ProductGlassToolbarDivider />
          <ProductGlassToolbarButton
            active={props.captureHidden === true}
            aria-pressed={props.captureHidden === true}
            data-ui="content.interactive-frame.capture-visibility"
            onClick={props.onCaptureVisibilityChange}
            onMouseDown={props.onMouseDown}
            title={props.captureVisibilityTitle}
          >
            {props.captureHidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </ProductGlassToolbarButton>
        </>
      ) : null}
      <ProductGlassToolbarDivider />
      <ProductGlassToolbarButton
        danger
        onClick={props.onDelete}
        onMouseDown={props.onMouseDown}
        title={labels.get('delete')}
      >
        <Trash2 size={16} />
      </ProductGlassToolbarButton>
      <ProductGlassToolbarButton
        className={'sniptale-dismiss-button'}
        onClick={props.onClose}
        onMouseDown={props.onMouseDown}
        title={labels.get('close')}
        aria-label={labels.get('close')}
      >
        <X size={16} />
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
          onSelect={(mode, event) => {
            if (mode !== props.effectMode) command(`effect-${mode}`)(event);
          }}
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
          onToggle={command('step-badge')}
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
          onToggle={command('callout')}
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
        {props.trailingSlot}
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
                <FrameAnnotationEffectIcon mode={mode} size={16} />
              </ProductGlassToolbarButton>
            ))}
          </ProductGlassToolbar>
        </div>
      ) : null}
    </div>
  );
}
