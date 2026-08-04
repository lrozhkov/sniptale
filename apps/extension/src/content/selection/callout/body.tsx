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
import { translate } from '../../../platform/i18n';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { resolveContentPortalTarget } from '../interactive-frame/layout/portal';
import { resolveCalloutThemeOwner } from './dom';
import { renderCalloutFloatingToolbar, renderDynamicCalloutTail } from './views';
import type { useCalloutVoiceInput } from './voice-input';
import { CalloutVoiceButton } from './voice-button';
import type { getDynamicTailState } from './dynamic-tail';
import type { getLineConnectorState } from './line-connector';
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
        data-frame-id={props.frameId}
        data-theme={props.portalTheme ?? undefined}
        style={mergeThemeScopedStyle(props.portalTheme, props.wrapperStyle)}
        onClick={props.handleClick}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={props.handleMouseEnter}
        onMouseLeave={props.handleMouseLeave}
      >
        {renderDynamicCalloutTail(props.dynamicTail, props.settings.style)}
        <div ref={props.containerRef as Ref<HTMLDivElement>} style={props.cloudStyle}>
          {props.settings.style.title.enabled ? (
            <input
              aria-label={translate('content.callout.titleLabel')}
              data-sniptale-callout-title="true"
              readOnly={!props.isEditing}
              value={props.settings.content.titleText}
              onChange={(event) => props.onTitleChange(event.target.value)}
              onBlur={(event) => {
                const callout = event.currentTarget.closest('.sniptale-callout');
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !callout?.contains(event.relatedTarget)
                ) {
                  props.handleBlur();
                }
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              style={{
                display: 'block',
                boxSizing: 'border-box',
                width: `calc(100% + ${props.settings.style.surface.paddingX * 2}px)`,
                marginTop: -props.settings.style.surface.paddingY,
                marginRight: -props.settings.style.surface.paddingX,
                marginBottom: props.settings.style.surface.paddingY,
                marginLeft: -props.settings.style.surface.paddingX,
                padding:
                  `${props.settings.style.surface.paddingY}px ` +
                  `${props.settings.style.surface.paddingX}px`,
                border: 0,
                borderRadius:
                  `${props.settings.style.surface.radius}px ` +
                  `${props.settings.style.surface.radius}px 0 0`,
                outline: 0,
                background: props.settings.style.title.backgroundColor,
                color: props.settings.style.title.textColor,
                fontSize: props.settings.style.title.fontSize,
                fontWeight: props.settings.style.title.fontWeight,
              }}
            />
          ) : null}
          <div {...createCalloutContentProps(props)} />
        </div>
        <CalloutVoiceButton
          isEditing={props.isEditing}
          leftOffset={props.voiceButtonLeftOffset}
          voice={props.voice}
        />
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
  frameId: string;
  handleBlur: (event?: ReactFocusEvent<HTMLDivElement>) => void;
  handleClick: (event: MouseEvent) => void;
  handleInput: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePaste: (event: ClipboardEvent) => void;
  onTitleChange: (titleText: string) => void;
  voice: ReturnType<typeof useCalloutVoiceInput>;
  voiceButtonLeftOffset: number;
  settings: CalloutSettings;
  wrapperStyle: CSSProperties;
  containerRef: RefObject<HTMLDivElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  dynamicTail:
    | ReturnType<typeof getDynamicTailState>
    | ReturnType<typeof getLineConnectorState>
    | null;
};

export function CalloutBody(props: CalloutBodyProps) {
  return createPortal(
    renderCalloutPortalContent(props),
    resolveContentPortalTarget(resolveCalloutThemeOwner())
  );
}
