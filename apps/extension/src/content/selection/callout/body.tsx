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
import { mergeThemeScopedStyle } from '@sniptale/ui/theme/safe-portal';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { resolveCalloutThemeOwner } from './dom';
import { renderCalloutFloatingToolbar, renderDynamicCalloutTail } from './views';
import type { getDynamicTailState } from './dynamic-tail';
import { renderCalloutInteractionHandles, type CalloutInteractionHandleProps } from './handles';

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
        ref={props.wrapperRef as Ref<HTMLDivElement>}
        className="sniptale-callout"
        data-theme={props.portalTheme ?? undefined}
        style={mergeThemeScopedStyle(props.portalTheme, props.wrapperStyle)}
        onClick={props.handleClick}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={props.handleMouseEnter}
        onMouseLeave={props.handleMouseLeave}
      >
        {renderDynamicCalloutTail(props.dynamicTail, props.settings.bgColor)}
        <div ref={props.containerRef as Ref<HTMLDivElement>} style={props.cloudStyle}>
          <div {...createCalloutContentProps(props)} />
        </div>
      </div>
      {renderCalloutInteractionHandles(props)}
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

type CalloutBodyProps = CalloutInteractionHandleProps & {
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
  settings: CalloutSettings;
  wrapperStyle: CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  dynamicTail: ReturnType<typeof getDynamicTailState> | null;
};

export function CalloutBody(props: CalloutBodyProps) {
  return createPortal(
    renderCalloutPortalContent(props),
    resolveContentPortalTarget(resolveCalloutThemeOwner())
  );
}
