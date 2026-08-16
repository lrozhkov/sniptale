import type { CSSProperties } from 'react';
import type { CalloutBadgeSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';

function getFrameCalloutBadgeStyle(badge: CalloutBadgeSettings): CSSProperties {
  const borderRadius =
    badge.shape === 'square' ? 0 : badge.shape === 'circle' ? 999 : Math.max(4, badge.size / 3);
  return {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: badge.backgroundColor,
    border: `${badge.borderWidth}px solid ${badge.borderColor}`,
    borderRadius,
    boxSizing: 'border-box',
    color: badge.textColor,
    display: 'inline-flex',
    flex: '0 0 auto',
    fontSize: badge.fontSize,
    fontWeight: badge.fontWeight,
    height: badge.size,
    justifyContent: 'center',
    lineHeight: 1,
    maxWidth: 160,
    minWidth: badge.size,
    overflow: 'hidden',
    outline: 0,
    paddingInline: Math.max(4, badge.size * 0.22),
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

export function FrameCalloutBadge(props: {
  badge: CalloutBadgeSettings;
  isEditing?: boolean;
  isMeasurement?: boolean;
  onEditingFinish?: () => void;
  onTextChange?: (text: string) => void;
  text?: string;
}) {
  if (!props.badge.enabled) return null;
  const text = props.text ?? props.badge.text;
  if (!props.isMeasurement && props.onTextChange) {
    return (
      <input
        aria-label={translate('content.callout.badgeTextLabel')}
        data-ui="content.callout.badge"
        maxLength={64}
        readOnly={!props.isEditing}
        size={Math.max(1, text.length)}
        style={{ ...getFrameCalloutBadgeStyle(props.badge), cursor: 'text' }}
        value={text}
        onChange={(event) => props.onTextChange?.(event.currentTarget.value)}
        onClick={(event) => {
          event.currentTarget.focus();
          event.currentTarget.setSelectionRange(
            event.currentTarget.value.length,
            event.currentTarget.value.length
          );
        }}
        onBlur={(event) => {
          const callout = event.currentTarget.closest('.sniptale-callout');
          if (!(event.relatedTarget instanceof Node) || !callout?.contains(event.relatedTarget)) {
            props.onEditingFinish?.();
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            props.onEditingFinish?.();
            event.currentTarget.blur();
          }
        }}
      />
    );
  }
  return (
    <span
      data-sniptale-callout-badge-measure={props.isMeasurement ? 'true' : undefined}
      data-ui={props.isMeasurement ? undefined : 'content.callout.badge'}
      style={getFrameCalloutBadgeStyle(props.badge)}
    >
      {text}
    </span>
  );
}

export function resolveFrameCalloutBadgeText(args: {
  badgeText: string;
  bodyHtml: string;
  titleEnabled: boolean;
  titleText: string;
}) {
  return args.badgeText.trim();
}
