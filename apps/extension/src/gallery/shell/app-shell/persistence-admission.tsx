import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Database, LoaderCircle } from 'lucide-react';
import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  prepareDatabaseForRecovery,
  resetDatabaseFromRecovery,
} from '../../../composition/persistence/infrastructure/indexed-db/core';
import type { DatabaseAdmissionStatus } from '../../../composition/persistence/infrastructure/indexed-db/admission';
import { translate } from '../../../platform/i18n';
import { formatBytes } from '../../../platform/i18n/format-bytes';

interface GalleryPersistenceAdmissionProps {
  children: ReactNode;
  prepare?: () => Promise<DatabaseAdmissionStatus>;
  reset?: () => Promise<DatabaseAdmissionStatus>;
}

function getRecoveryCopy(status: Exclude<DatabaseAdmissionStatus, { status: 'ready' }>) {
  if (status.status === 'blocked' && status.reason === 'recovery-reset-failed') {
    return {
      body: translate('gallery.recovery.resetFailed'),
      title: translate('gallery.recovery.resetIncompleteTitle'),
    };
  }
  if (status.status === 'blocked') {
    return {
      body: translate('gallery.recovery.blockedBody'),
      title: translate('gallery.recovery.blockedTitle'),
    };
  }
  if (status.status === 'corrupt') {
    return {
      body: translate('gallery.recovery.corruptBody'),
      title: translate('gallery.recovery.corruptTitle'),
    };
  }
  if (status.status === 'unsupported-version') {
    return {
      body: translate('gallery.recovery.unsupportedBody'),
      title: translate('gallery.recovery.unsupportedTitle'),
    };
  }
  if (status.status === 'insufficient-space') {
    return {
      body: translate('gallery.recovery.spaceBody'),
      title: translate('gallery.recovery.spaceTitle'),
    };
  }
  return {
    body: translate('gallery.recovery.backupBody'),
    title: translate('gallery.recovery.backupTitle'),
  };
}

function AdmissionPanel(props: {
  busy: boolean;
  errorMessage: string | null;
  onReset: () => void;
  onRetry: () => void;
  status: Exclude<DatabaseAdmissionStatus, { status: 'ready' }>;
}) {
  const copy = getRecoveryCopy(props.status);
  const canReset =
    props.status.status === 'corrupt' || props.status.status === 'unsupported-version';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--sniptale-color-surface-canvas)] p-6">
      <section
        aria-labelledby="gallery-persistence-recovery-title"
        className="w-full max-w-xl rounded-[20px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] p-8 text-[var(--sniptale-color-text-primary)]
          shadow-[var(--sniptale-shadow-panel)]"
      >
        <AlertTriangle className="mb-4 h-8 w-8 text-[var(--sniptale-color-danger)]" aria-hidden />
        <h1 id="gallery-persistence-recovery-title" className="text-xl font-semibold">
          {copy.title}
        </h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-[var(--sniptale-color-text-muted)]">
          {copy.body}
        </p>
        {props.errorMessage ? (
          <p className="mt-3 text-sm leading-6 text-[var(--sniptale-color-danger)]" role="alert">
            {props.errorMessage}
          </p>
        ) : null}
        {props.status.status === 'insufficient-space' ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.recovery.requiredSpace')}
              </dt>
              <dd className="mt-1 font-semibold">{formatBytes(props.status.requiredBytes)}</dd>
            </div>
            <div>
              <dt className="text-[var(--sniptale-color-text-muted)]">
                {translate('gallery.recovery.availableSpace')}
              </dt>
              <dd className="mt-1 font-semibold">{formatBytes(props.status.availableBytes)}</dd>
            </div>
          </dl>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onRetry}
            className={getControlPrimaryButtonClassName()}
          >
            {translate('gallery.recovery.retry')}
          </button>
          {canReset ? (
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onReset}
              className={getControlSecondaryButtonClassName({ tone: 'danger' })}
            >
              {translate('gallery.recovery.reset')}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function CheckingPanel() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[var(--sniptale-color-surface-canvas)] p-6"
    >
      <section className="max-w-md text-center text-[var(--sniptale-color-text-primary)]">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full
            bg-[var(--sniptale-color-surface-panel)]"
        >
          <Database className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">{translate('gallery.recovery.checkingTitle')}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.recovery.checkingBody')}
        </p>
        <LoaderCircle className="mx-auto mt-5 h-5 w-5 animate-spin" aria-hidden />
      </section>
    </main>
  );
}

export function GalleryPersistenceAdmission({
  children,
  prepare = prepareDatabaseForRecovery,
  reset = resetDatabaseFromRecovery,
}: GalleryPersistenceAdmissionProps) {
  const [status, setStatus] = useState<DatabaseAdmissionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const runPreparation = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      setStatus(await prepare());
    } catch {
      setStatus({ databaseVersion: null, reason: 'connection-blocked', status: 'blocked' });
    } finally {
      setBusy(false);
    }
  }, [prepare]);

  useEffect(() => {
    void runPreparation();
  }, [runPreparation]);

  if (status?.status === 'ready') return children;
  if (!status) return <CheckingPanel />;
  return (
    <>
      <AdmissionPanel
        busy={busy}
        errorMessage={errorMessage}
        onReset={() => setResetOpen(true)}
        onRetry={() => void runPreparation()}
        status={status}
      />
      <ProductConfirmDialog
        cancelText={translate('gallery.recovery.cancel')}
        confirmText={translate('gallery.recovery.reset')}
        isLoading={busy}
        isOpen={resetOpen}
        message={translate('gallery.recovery.resetBody')}
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          setErrorMessage(null);
          try {
            setStatus(await reset());
            setResetOpen(false);
          } catch {
            setResetOpen(false);
            setErrorMessage(translate('gallery.recovery.resetFailed'));
          } finally {
            setBusy(false);
          }
        }}
        title={translate('gallery.recovery.resetTitle')}
      />
    </>
  );
}
