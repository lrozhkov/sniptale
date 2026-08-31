import { FolderOpen, Globe2, MousePointer2, Pin } from 'lucide-react';

import { translate } from '../../../platform/i18n/popup';
import type {
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { PageAccessOperation as PageAccessOperationValue } from '@sniptale/runtime-contracts/messaging/page-access';

const pageAccessSectionClassName = ['flex h-[88px] min-h-[88px] flex-col gap-1.5'].join(' ');

const pageAccessButtonClassName = [
  'flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1.5 rounded-[12px] border px-1.5 py-2',
  'text-center text-[10px] font-semibold leading-[1.15] transition-colors',
  'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
  'hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-muted)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'disabled:hover:border-[var(--sniptale-color-border-soft)] disabled:hover:bg-transparent',
].join(' ');

function PageAccessErrorMessage({ message }: { message: string }) {
  return (
    <div
      className={[
        'min-h-5 truncate rounded-[6px] border px-2 py-0.5 text-[10px]',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,var(--sniptale-color-border-soft)_86%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_5%,var(--sniptale-color-surface-hover)_95%)]',
        'text-[var(--sniptale-color-text-primary-strong)]',
      ].join(' ')}
      role="alert"
      title={message}
    >
      {message}
    </div>
  );
}

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
      <Icon size={20} aria-hidden="true" />
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
    return props.error ? (
      <section
        className={`${pageAccessSectionClassName} justify-center`}
        data-ui="popup.page-access.controls"
      >
        <PageAccessErrorMessage message={props.error} />
      </section>
    ) : null;
  }

  const isPending = (operation: PageAccessOperation) => props.pendingOperation === operation;
  const isLocalFile = props.status.currentTabOrigin === 'file:///';

  return (
    <section className={pageAccessSectionClassName} data-ui="popup.page-access.controls">
      <div className={`grid min-h-0 flex-1 gap-2 ${isLocalFile ? 'grid-cols-1' : 'grid-cols-3'}`}>
        {isLocalFile ? (
          <PageAccessActionButton
            disabled={props.disabled}
            icon={FolderOpen}
            isPending={isPending(PageAccessOperationValue.GRANT_SITE)}
            onClick={() => props.onRequest(PageAccessOperationValue.GRANT_SITE)}
          >
            {translate('popup.home.enableLocalFiles')}
          </PageAccessActionButton>
        ) : (
          <>
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
          </>
        )}
      </div>
      {props.error ? <PageAccessErrorMessage message={props.error} /> : null}
    </section>
  );
}
