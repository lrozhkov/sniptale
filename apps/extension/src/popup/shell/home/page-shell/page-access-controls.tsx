import { Globe2, MousePointer2, Pin } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import type {
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { PageAccessOperation as PageAccessOperationValue } from '@sniptale/runtime-contracts/messaging/page-access';
import { PopupHomeErrorMessage } from './sections';

const pageAccessSectionClassName = [
  'rounded-[8px] border p-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_76%,transparent)]',
].join(' ');

const pageAccessButtonClassName = [
  'flex min-h-9 w-full items-center justify-center gap-2 rounded-[8px] border px-3 py-2',
  'text-xs font-medium transition-colors',
  'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
  'hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-muted)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'disabled:hover:border-[var(--sniptale-color-border-soft)] disabled:hover:bg-transparent',
].join(' ');

function PageAccessActionButton(props: {
  children: string;
  disabled: boolean;
  icon: typeof MousePointer2;
  isPending: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      className={pageAccessButtonClassName}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{props.isPending ? translate('popup.home.pageAccessWorking') : props.children}</span>
    </button>
  );
}

export function PageAccessControls(props: {
  disabled: boolean;
  error: string | null;
  onRequest: (operation: PageAccessOperation) => void;
  pendingOperation: PageAccessOperation | null;
  status: PageAccessStatus | null;
}) {
  if (!props.status?.supported || props.status.currentTabActive) {
    return props.error ? <PopupHomeErrorMessage message={props.error} /> : null;
  }

  const isPending = (operation: PageAccessOperation) => props.pendingOperation === operation;

  return (
    <section className={pageAccessSectionClassName}>
      <div className="grid gap-2">
        <PageAccessActionButton
          disabled={props.disabled}
          icon={MousePointer2}
          isPending={isPending(PageAccessOperationValue.ACTIVATE_CURRENT_TAB)}
          onClick={() => props.onRequest(PageAccessOperationValue.ACTIVATE_CURRENT_TAB)}
        >
          {translate('popup.home.enableForTab')}
        </PageAccessActionButton>
        <PageAccessActionButton
          disabled={props.disabled}
          icon={Pin}
          isPending={isPending(PageAccessOperationValue.GRANT_SITE)}
          onClick={() => props.onRequest(PageAccessOperationValue.GRANT_SITE)}
        >
          {translate('popup.home.alwaysEnableSite')}
        </PageAccessActionButton>
        <PageAccessActionButton
          disabled={props.disabled}
          icon={Globe2}
          isPending={isPending(PageAccessOperationValue.GRANT_ALL_SITES)}
          onClick={() => props.onRequest(PageAccessOperationValue.GRANT_ALL_SITES)}
        >
          {translate('popup.home.alwaysEnableAllSites')}
        </PageAccessActionButton>
      </div>
      {props.error ? (
        <div className="mt-2">
          <PopupHomeErrorMessage message={props.error} />
        </div>
      ) : null}
    </section>
  );
}
