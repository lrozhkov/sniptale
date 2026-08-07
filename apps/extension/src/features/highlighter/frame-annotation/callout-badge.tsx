import type { CSSProperties } from 'react';
import type { CalloutBadgeSettings } from '@sniptale/runtime-contracts/highlighter/callout';

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
    paddingInline: Math.max(4, badge.size * 0.22),
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

export function FrameCalloutBadge(props: {
  badge: CalloutBadgeSettings;
  isMeasurement?: boolean;
  text?: string;
}) {
  if (!props.badge.enabled) return null;
  return (
    <span
      data-sniptale-callout-badge-measure={props.isMeasurement ? 'true' : undefined}
      data-ui={props.isMeasurement ? undefined : 'content.callout.badge'}
      style={getFrameCalloutBadgeStyle(props.badge)}
    >
      {props.text ?? props.badge.text}
    </span>
  );
}

function getBodyText(bodyHtml: string) {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(bodyHtml, 'text/html').body.textContent?.trim() ?? '';
  }
  return bodyHtml
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveFrameCalloutBadgeText(args: {
  badgeText: string;
  bodyHtml: string;
  titleEnabled: boolean;
  titleText: string;
}) {
  return (
    args.badgeText.trim() ||
    (args.titleEnabled ? args.titleText.trim() : '') ||
    getBodyText(args.bodyHtml)
  );
}
