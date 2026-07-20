import type { ReactNode } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  INSPECTOR_STATUS_BADGE_NEUTRAL_CLASS_NAME,
  INSPECTOR_STATUS_BADGE_SUCCESS_CLASS_NAME,
} from '../chrome';
import type { EditorDocumentActionCommand } from './model/types';
import type { AsyncFeedbackStatus } from './feedback';
import {
  dangerPanelButtonClassName,
  neutralPanelButtonClassName,
  primaryPanelButtonClassName,
  secondaryPanelButtonClassName,
  tertiaryPanelButtonClassName,
} from './shared';

export const actionLabelClassName = 'min-w-0 text-[13px] font-medium';

export const actionMetaClassName =
  'text-[10px] font-semibold uppercase text-[color:var(--sniptale-color-text-secondary)]';

export function getActionButtonClassName(action: EditorDocumentActionCommand): string {
  if (action.emphasis === 'primary') {
    return primaryPanelButtonClassName;
  }

  if (action.emphasis === 'secondary') {
    return secondaryPanelButtonClassName;
  }

  if (action.emphasis === 'neutral') {
    return neutralPanelButtonClassName;
  }

  if (action.emphasis === 'danger') {
    return dangerPanelButtonClassName;
  }

  return tertiaryPanelButtonClassName;
}

export function getActionIconClassName(action: EditorDocumentActionCommand): string {
  if (action.emphasis === 'primary') {
    return 'text-[color:var(--sniptale-color-accent-emphasis)]';
  }

  if (action.emphasis === 'danger') {
    return 'text-[color:var(--sniptale-color-danger)]';
  }

  return 'text-[color:var(--sniptale-color-text-secondary)]';
}

function shouldRenderActionFeedbackBadge(action: EditorDocumentActionCommand): boolean {
  return action.id === 'save-image' || action.id === 'copy-png';
}

function renderStatusIconBadge(args: { className: string; icon: ReactNode; title: string }) {
  return (
    <span className={args.className} title={args.title} aria-label={args.title}>
      {args.icon}
    </span>
  );
}

function renderActionFeedbackBadge(status: AsyncFeedbackStatus): ReactNode {
  if (status === 'saving') {
    return renderStatusIconBadge({
      className: INSPECTOR_STATUS_BADGE_NEUTRAL_CLASS_NAME,
      icon: <LoaderCircle size={12} className="animate-spin" strokeWidth={2} />,
      title: translate('common.states.saving'),
    });
  }

  if (status === 'saved') {
    return renderStatusIconBadge({
      className: INSPECTOR_STATUS_BADGE_SUCCESS_CLASS_NAME,
      icon: <Check size={12} strokeWidth={2.4} />,
      title: translate('common.states.saved'),
    });
  }

  return null;
}

export function resolveActionFeedbackBadge(
  action: EditorDocumentActionCommand,
  status: AsyncFeedbackStatus
): ReactNode {
  return shouldRenderActionFeedbackBadge(action) ? renderActionFeedbackBadge(status) : null;
}
