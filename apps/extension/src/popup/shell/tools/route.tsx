import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import { useState } from 'react';
import { translate } from '../../../platform/i18n/popup';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { openScreenshotMode } from '../navigation/actions';
import { useActiveTabCapabilities } from '../tab-access/capabilities';
import { PopupToolsPanel } from './panel';

export function ToolsRoute() {
  const capabilities = useActiveTabCapabilities();
  const [error, setError] = useState<string | null>(null);
  const disabledReason = capabilities.screenshotMode.reason;

  return (
    <section
      className={[
        'flex h-full min-h-0 flex-col rounded-[16px] border p-3',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      <p className="mb-2.5 shrink-0 px-1 text-[11px] leading-[1.4] text-[var(--sniptale-color-text-muted)]">
        {translate('popup.home.toolsIntroDescription')}
      </p>
      <PopupToolsPanel
        disabledReason={disabledReason}
        onOpen={(mode) => {
          setError(null);
          void openScreenshotMode(mode).catch((openError) => {
            setError(
              createUserFacingErrorMessage({
                cause: openError,
                detail: 'browserCommunication',
                summaryKey: 'popup.home.openPrepError',
              })
            );
          });
        }}
      />
      {error ? (
        <p className="mt-2 shrink-0 text-[11px] text-[var(--sniptale-color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
