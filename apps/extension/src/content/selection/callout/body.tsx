import { createPortal } from 'react-dom';
import type {
  ClipboardEvent,
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent,
  MouseEvent,
  Ref,
  RefObject,
} from 'react';
import type { AppTheme } from '../../../ui/theme';
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { resolveCalloutThemeOwner } from './dom';
import { renderCalloutFloatingToolbar, renderCalloutTail } from './views';

function createCalloutContentProps(props: CalloutBodyProps) {
  return {
    contentEditable: props.isEditing,
    onBlur: props.handleBlur,
    onInput: props.handleInput,
    onKeyDown: props.handleKeyDown,
    onPaste: props.handlePaste,
    ref: props.contentEditableRef as Ref<HTMLDivElement>,
    style: props.editableStyle,
    suppressContentEditableWarning: true,
  };
}

function renderCalloutPortalContent(props: CalloutBodyProps) {
  return (
    <>
      <div
        className="sniptale-callout"
        data-theme={props.portalTheme ?? undefined}
        style={mergeThemeScopedStyle(props.portalTheme, props.wrapperStyle)}
        onClick={props.handleClick}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div ref={props.containerRef as Ref<HTMLDivElement>} style={props.cloudStyle}>
          <div {...createCalloutContentProps(props)} />
          {renderCalloutTail({
            bgColor: props.settings.bgColor,
            resolvedSide: props.resolvedSide,
            tailOffset: props.tailOffset,
            tailSize: props.settings.tailSize,
            variant: props.settings.variant,
          })}
        </div>
      </div>
      {renderCalloutFloatingToolbar({
        applyFormatting: props.applyFormatting,
        effectiveZIndex: props.effectiveZIndex,
        floatingToolbarRect: props.floatingToolbarRect,
        isEditing: props.isEditing,
        portalTheme: props.portalTheme,
        resolveThemeOwner: resolveCalloutThemeOwner,
      })}
    </>
  );
}

type CalloutBodyProps = {
  applyFormatting: (command: string, event: MouseEvent) => void;
  cloudStyle: CSSProperties;
  contentEditableRef: RefObject<HTMLDivElement | null>;
  editableStyle: CSSProperties;
  effectiveZIndex: number;
  floatingToolbarRect: DOMRect | null;
  handleBlur: (event?: ReactFocusEvent<HTMLDivElement>) => void;
  handleClick: (event: MouseEvent) => void;
  handleInput: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePaste: (event: ClipboardEvent) => void;
  isEditing: boolean;
  portalTheme: AppTheme | null;
  resolvedSide: 'top' | 'right' | 'bottom' | 'left';
  settings: CalloutSettings;
  tailOffset: number;
  wrapperStyle: CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
};

export function CalloutBody(props: CalloutBodyProps) {
  return createPortal(
    renderCalloutPortalContent(props),
    resolveContentPortalTarget(resolveCalloutThemeOwner())
  );
}
