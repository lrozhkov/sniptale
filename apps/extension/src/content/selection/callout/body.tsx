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
import {
  renderCalloutAccentEdge,
  renderCalloutFloatingToolbar,
  renderDynamicCalloutTail,
} from './views';
import type { useCalloutVoiceInput } from './voice-input';
import { CalloutVoiceButton } from './voice-button';
import type { getDynamicTailState } from './dynamic-tail';
import type { getLineConnectorState } from './line-connector';
import { renderCalloutInteractionHandles, type CalloutInteractionHandleProps } from './handles';
import { getCalloutTitleMeasureStyle, getCalloutTitleStyle } from './title-style';
import {
  resolveCalloutCustomCss,
  type ResolvedCalloutCustomCss,
} from '../../../features/highlighter/callout-custom-css';

function createCalloutContentProps(
  props: CalloutBodyProps,
  customStyles: ResolvedCalloutCustomCss
) {
  return {
    contentEditable: props.isEditing,
    onBlur: props.handleBlur,
    onInput: props.handleInput,
    onKeyDown: props.handleKeyDown,
    onPaste: props.handlePaste,
    ref: props.contentEditableRef as Ref<HTMLDivElement>,
    style: { ...props.editableStyle, ...customStyles.body },
    suppressContentEditableWarning: true,
  };
}

function renderCalloutPortalContent(props: CalloutBodyProps) {
  const customStyles = resolveCalloutCustomCss(props.settings.style.customCss).styles;
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
        {renderDynamicCalloutTail(props.dynamicTail, props.settings.style, customStyles)}
        <div
          ref={props.containerRef as Ref<HTMLDivElement>}
          style={{ ...props.cloudStyle, ...customStyles.card }}
        >
          {props.settings.style.title.enabled ? (
            <>
              <span
                aria-hidden="true"
                data-sniptale-callout-title-measure="true"
                style={{
                  ...getCalloutTitleMeasureStyle(props.settings.style),
                  ...customStyles.title,
                }}
              >
                {props.settings.content.titleText}
              </span>
              <input
                aria-label={translate('content.callout.titleLabel')}
                data-sniptale-callout-title="true"
                readOnly={!props.isEditing}
                size={1}
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
                  ...getCalloutTitleStyle(
                    props.settings.style,
                    props.dynamicTail?.kind === 'wedge' &&
                      props.settings.style.surface.borderWidth > 0
                  ),
                  ...customStyles.title,
                }}
              />
            </>
          ) : null}
          <div {...createCalloutContentProps(props, customStyles)} />
        </div>
        {renderCalloutAccentEdge(props.settings.style, props.calloutDimensions, customStyles)}
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
  calloutDimensions: { width: number; height: number };
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
