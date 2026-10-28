import { useEffect, useId, useState } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import type { SyncProductStatus } from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { SettingsControlRow, settingsCompactWorkbenchClassName } from '../../../section-surface';
import {
  createSyncConnectionController,
  type SyncConnectionViewState,
} from './sync-connection-controller';

const connectionFields = [
  { name: 'url', type: 'url', autoComplete: 'url' },
  { name: 'account', type: 'text', autoComplete: 'off' },
  { name: 'username', type: 'text', autoComplete: 'username' },
  { name: 'password', type: 'password', autoComplete: 'current-password' },
] as const;

type FieldName = (typeof connectionFields)[number]['name'];
type ConnectionFormValues = Record<FieldName, string> & { mode: 'create' | 'join' };

function ConnectionFields({
  form,
  onChange,
  disabled,
  workspaceLocked,
}: {
  form: ConnectionFormValues;
  onChange: (name: FieldName, value: string) => void;
  disabled: boolean;
  workspaceLocked: boolean;
}) {
  const id = useId();
  return connectionFields.map((field) => {
    const label =
      field.name === 'url' ? (form.mode === 'create' ? 'parentUrl' : 'rootUrl') : field.name;
    return (
      <SettingsControlRow
        key={field.name}
        label={
          <label htmlFor={`${id}-${field.name}`}>
            {translate(`settings.syncConnection.${label}`)}
          </label>
        }
      >
        <ProductInput
          id={`${id}-${field.name}`}
          type={field.type}
          autoComplete={field.autoComplete}
          required
          value={form[field.name]}
          disabled={
            disabled || ((field.name === 'url' || field.name === 'account') && workspaceLocked)
          }
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      </SettingsControlRow>
    );
  });
}

function SyncConnectionForm({
  controller,
  status,
  disabled,
  busy,
  ready,
}: {
  controller: ReturnType<typeof createSyncConnectionController>;
  status: SyncProductStatus | null;
  disabled: boolean;
  busy: boolean;
  ready: boolean;
}) {
  const [form, setForm] = useState<ConnectionFormValues>({
    mode: 'join',
    url: '',
    account: '',
    username: '',
    password: '',
  });
  const onEnrolled = () => setForm((previous) => ({ ...previous, password: '' }));
  const submit = () => {
    if (status?.workspace) {
      void controller.resumeWorkspace(
        ready ? 'enroll' : 'retry',
        {
          kind: 'basic',
          username: form.username,
          password: form.password,
        },
        onEnrolled
      );
    } else void controller.connect(form, onEnrolled);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={translate('settings.syncConnection.title')}
      >
        {(['create', 'join'] as const).map((value) => (
          <ProductActionButton
            key={value}
            compact
            tone="secondary"
            type="button"
            aria-pressed={form.mode === value}
            disabled={disabled || Boolean(status?.workspace)}
            onClick={() => setForm((previous) => ({ ...previous, mode: value }))}
          >
            {translate(
              value === 'create' ? 'settings.syncConnection.create' : 'settings.syncConnection.join'
            )}
          </ProductActionButton>
        ))}
      </div>
      <ConnectionFields
        form={form}
        disabled={disabled}
        workspaceLocked={Boolean(status?.workspace)}
        onChange={(name, value) => setForm((previous) => ({ ...previous, [name]: value }))}
      />
      <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('settings.syncConnection.httpsHint')}
      </p>
      <div className="flex flex-wrap gap-2">
        {status?.workspace && !ready ? (
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={
              disabled ||
              status.workspace.phase === 'allocating' ||
              !form.username ||
              !form.password
            }
            onClick={submit}
          >
            {translate('settings.syncConnection.retry')}
          </ProductActionButton>
        ) : (
          <ProductActionButton
            compact
            tone="secondary"
            type="submit"
            disabled={
              disabled ||
              !form.username ||
              !form.password ||
              (!ready && (!form.url || !form.account))
            }
          >
            {translate(
              ready ? 'settings.syncConnection.enroll' : 'settings.syncConnection.connect'
            )}
          </ProductActionButton>
        )}
        {status?.workspace ? (
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={busy}
            onClick={() => void controller.abandon()}
          >
            {translate('settings.syncConnection.abandon')}
          </ProductActionButton>
        ) : null}
      </div>
      {status?.workspace ? (
        <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.syncConnection.abandonHint')}
        </p>
      ) : null}
    </form>
  );
}

function getWorkspaceFailure({
  status,
  busy,
  message,
}: SyncConnectionViewState): 'workspaceInterrupted' | 'workspaceTemporary' | 'failed' | null {
  if (busy || message || !status?.workspace) return null;
  const job = status.workspaceJob;
  if (!job) return null;
  if (job.state === 'interrupted') return 'workspaceInterrupted';
  if (job.state !== 'failed') return null;
  return job.failureCode === 'temporary' ? 'workspaceTemporary' : 'failed';
}

/** Transient credentials stay in the form; the runtime owns connection readiness and enrollment. */
export function SyncConnectionSection() {
  useAppLocale();
  const [state, setState] = useState<SyncConnectionViewState>({
    status: null,
    busy: false,
    message: null,
    catalogJob: null,
  });
  const [controller] = useState(() =>
    createSyncConnectionController({
      client: createSyncProductClient(),
      requestPermission: (origin) => browserPermissions.request({ origins: [`${origin}/*`] }),
      onChange: setState,
    })
  );
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  const { status, busy, message, catalogJob } = state;
  const workspaceRunning = Boolean(status?.workspace && status.workspaceJob?.state === 'running');
  const workspaceFailure = getWorkspaceFailure(state);
  const disabled = busy || workspaceRunning || Boolean(catalogJob);
  const ready = status?.workspace?.phase === 'ready';
  const connected = Boolean(status?.connection);

  return (
    <section
      aria-label={translate('settings.syncConnection.title')}
      className={`${settingsCompactWorkbenchClassName} max-w-[960px] space-y-4`}
    >
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate(
          connected ? 'settings.syncConnection.connected' : 'settings.syncConnection.unconfigured'
        )}
      </p>
      {status?.connection ? <p className="break-all text-xs">{status.connection.rootUrl}</p> : null}
      {status?.workspace && !connected ? (
        <p className="break-all text-xs">{status.workspace.rootUrl}</p>
      ) : null}
      {!connected ? (
        <SyncConnectionForm
          controller={controller}
          status={status}
          disabled={disabled}
          busy={busy}
          ready={ready}
        />
      ) : (
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          disabled={disabled || status?.connection?.phase !== 'active'}
          onClick={() => void controller.refresh()}
        >
          {translate('settings.syncConnection.refresh')}
        </ProductActionButton>
      )}
      {workspaceRunning ? (
        <p role="status" className="text-sm">
          {translate('settings.syncConnection.connecting')}
        </p>
      ) : ready && !connected ? (
        <p role="status" className="text-sm">
          {translate('settings.syncConnection.ready')}
        </p>
      ) : null}
      {status?.connection?.phase === 'paused' ? (
        <p role="status">{translate('settings.syncConnection.paused')}</p>
      ) : null}
      {workspaceFailure ? (
        <p role="alert" className="text-sm">
          {translate(`settings.syncConnection.${workspaceFailure}`)}
        </p>
      ) : null}
      {message ? (
        <p
          role={message === 'refreshing' || message === 'refreshed' ? 'status' : 'alert'}
          className="text-sm"
        >
          {translate(`settings.syncConnection.${message}`)}
        </p>
      ) : null}
    </section>
  );
}
