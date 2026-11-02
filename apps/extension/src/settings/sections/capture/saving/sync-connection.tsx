import { CheckboxField } from '../../../../ui/compact-inspector-controls';
import {
  useSettingsSecretProtection,
  SettingsSecretProtectionParticipantSummary,
} from '../../../secret-protection/context';
import { SYNC_CHECKPOINT_INTERVALS } from '../../../../composition/persistence/sync-capture/contracts';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { formatBytes } from '../../../../platform/i18n/format-bytes';
import { useEffect, useId, useRef, useState } from 'react';
import { ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
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
  credentialsOnly = false,
}: {
  form: ConnectionFormValues;
  onChange: (name: FieldName, value: string) => void;
  disabled: boolean;
  workspaceLocked: boolean;
  credentialsOnly?: boolean;
}) {
  const id = useId();
  return connectionFields
    .filter((field) => !credentialsOnly || field.name === 'username' || field.name === 'password')
    .map((field) => {
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
            readOnly={credentialsOnly && field.name === 'username'}
            placeholder={translate(`settings.syncConnection.${label}`)}
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

function ConnectedCredentialControls({
  state,
  controller,
  disabled,
}: {
  state: SyncConnectionViewState;
  controller: ReturnType<typeof createSyncConnectionController>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const connection = state.status?.connection;
  useEffect(() => {
    setEditing(false);
    setPassword('');
  }, [connection?.expected.incarnation, connection?.expected.revision]);
  if (!connection) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing(true);
            setPassword('');
          }}
        >
          {translate('settings.syncConnection.updateCredentials')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          disabled={disabled}
          onClick={() => void controller.grantServerAccess()}
        >
          {translate('settings.syncConnection.grantServerAccess')}
        </ProductActionButton>
      </div>
      {editing ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void controller.updateAuthentication(
              { kind: 'basic', username: connection.accountId, password },
              () => {
                setPassword('');
                setEditing(false);
              }
            );
          }}
        >
          <ConnectionFields
            form={{
              mode: 'join',
              url: connection.rootUrl,
              account: connection.accountId,
              username: connection.accountId,
              password,
            }}
            disabled={disabled}
            workspaceLocked
            credentialsOnly
            onChange={(name, value) => {
              if (name === 'password') setPassword(value);
            }}
          />
          <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.syncConnection.credentialAccountHint')}
          </p>
          <div className="flex flex-wrap gap-2">
            <ProductActionButton
              compact
              tone="secondary"
              type="submit"
              disabled={disabled || !password}
            >
              {translate('settings.syncConnection.saveCredentials')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              type="button"
              disabled={disabled}
              onClick={() => {
                setPassword('');
                setEditing(false);
              }}
            >
              {translate('common.actions.cancel')}
            </ProductActionButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function SyncConnectionForm({
  controller,
  state,
  disabled,
  busy,
  ready,
}: {
  controller: ReturnType<typeof createSyncConnectionController>;
  state: SyncConnectionViewState;
  disabled: boolean;
  busy: boolean;
  ready: boolean;
}) {
  const { status, discovery } = state;
  const [form, setForm] = useState<ConnectionFormValues>({
    mode: 'join',
    url: '',
    account: '',
    username: '',
    password: '',
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [storageConfirmed, setStorageConfirmed] = useState(false);
  const choicesId = useId();
  const endpointEdited = useRef(false);
  const source = status?.workspace?.source;
  const workspaceUrl = status?.workspace?.rootUrl;
  const workspaceAccount = status?.workspace?.accountId;
  const presenceKind = state.localPresence;
  useEffect(() => {
    setSelected(null);
    setStorageConfirmed(false);
    if (workspaceUrl !== undefined && workspaceAccount !== undefined && !endpointEdited.current)
      setForm((previous) => ({
        ...previous,
        url: workspaceUrl,
        account: workspaceAccount,
      }));
  }, [
    source?.kind,
    source?.identity.incarnation,
    source?.identity.revision,
    workspaceUrl,
    workspaceAccount,
  ]);
  const discoveryRevision = discovery
    ? JSON.stringify([discovery.source, discovery.candidates])
    : '';
  useEffect(() => {
    setSelected(null);
  }, [discoveryRevision]);
  const authentication = () => ({
    kind: 'basic' as const,
    username: form.username,
    password: form.password,
  });
  const onEnrolled = () => setForm((previous) => ({ ...previous, password: '' }));
  const submit = () => {
    if (ready)
      void controller.resumeWorkspace('enroll', authentication(), onEnrolled, storageConfirmed);
    else if (discovery) {
      if (selected !== null) void controller.selectWorkspace(selected, authentication());
    } else if (status?.workspace?.source.kind === 'allocation')
      void controller.resumeWorkspace('retry', authentication(), onEnrolled);
    else void controller.connect(form, onEnrolled);
  };
  const running = status?.workspaceJob?.state === 'running';
  const allocation = status?.workspace?.source.kind === 'allocation';
  const credentialsMissing = !form.username || !form.password;
  const setupAction = ready
    ? 'enroll'
    : discovery
      ? 'selectWorkspace'
      : allocation
        ? 'retry'
        : status?.workspace
          ? 'repeatSearch'
          : form.mode === 'create'
            ? 'connect'
            : 'search';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
      data-ui="settings.sync-setup"
    >
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={translate('settings.syncConnection.title')}
      >
        {(['join', 'create'] as const).map((value) => (
          <ProductActionButton
            key={value}
            compact
            tone="secondary"
            type="button"
            aria-pressed={form.mode === value}
            disabled={busy || disabled || (value === 'join' && Boolean(status?.workspace))}
            onClick={() => {
              if (value === form.mode && !status?.workspace) return;
              if (value === 'create')
                void controller.selectCreate().then((allowed) => {
                  if (allowed) {
                    controller.invalidateSetup();
                    endpointEdited.current = false;
                    setSelected(null);
                    setStorageConfirmed(false);
                    setForm((previous) => ({ ...previous, mode: value, url: '', password: '' }));
                  }
                });
              else {
                controller.invalidateSetup();
                endpointEdited.current = false;
                setSelected(null);
                setStorageConfirmed(false);
                setForm((previous) => ({ ...previous, mode: value, url: '', password: '' }));
              }
            }}
          >
            {translate(
              value === 'create' ? 'settings.syncConnection.create' : 'settings.syncConnection.join'
            )}
          </ProductActionButton>
        ))}
      </div>
      <ConnectionFields
        form={
          ready && status?.workspace
            ? { ...form, url: status.workspace.rootUrl, account: status.workspace.accountId }
            : form
        }
        disabled={disabled || (busy && ready)}
        workspaceLocked={ready || allocation}
        onChange={(name, value) => {
          if (name === 'url' || name === 'account') endpointEdited.current = true;
          controller.invalidateSetup();
          setSelected(null);
          setStorageConfirmed(false);
          setForm((previous) => ({ ...previous, [name]: value }));
        }}
      />
      <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate(
          form.mode === 'create'
            ? 'settings.syncConnection.createHint'
            : 'settings.syncConnection.httpsHint'
        )}
      </p>
      {discovery ? (
        <div className="space-y-3" data-ui="settings.sync-discovery">
          <p role="status" className="text-sm">
            {translate(
              !discovery.complete
                ? 'settings.syncConnection.discoveryPartial'
                : discovery.candidates.length === 0
                  ? 'settings.syncConnection.discoveryEmpty'
                  : 'settings.syncConnection.discoveryFound'
            )}
          </p>
          {discovery.candidates.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                {translate('settings.syncConnection.selectWorkspace')}
              </legend>
              {discovery.candidates.map((candidate, index) => (
                <label
                  key={`${candidate.prefix}:${candidate.identity.fingerprint}`}
                  className="flex min-w-0 items-start gap-2 text-sm"
                >
                  <input
                    className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--sniptale-color-text-primary)]"
                    type="radio"
                    name={choicesId}
                    value={String(index)}
                    checked={selected === index}
                    disabled={busy}
                    onChange={() => setSelected(index)}
                  />
                  <span className="min-w-0 break-all">
                    {candidate.prefix || translate('settings.syncConnection.exactWorkspace')}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : status?.workspace?.source.kind === 'join' && !ready && !running ? (
        <p className="text-sm">{translate('settings.syncConnection.repeatSearchHint')}</p>
      ) : null}
      {ready ? (
        <div className="space-y-3" data-ui="settings.sync-storage-policy">
          <h3 className="text-sm font-medium">
            {translate('settings.syncConnection.reviewTitle')}
          </h3>
          <p role="status" className="text-sm" data-ui="settings.sync-local-presence">
            {translate(
              presenceKind === 'present'
                ? 'settings.syncConnection.localDataPresent'
                : presenceKind === 'empty'
                  ? 'settings.syncConnection.localDataEmpty'
                  : presenceKind === 'unavailable'
                    ? 'settings.syncConnection.localDataUnavailable'
                    : 'settings.syncConnection.localDataLoading'
            )}
          </p>
          <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.syncConnection.localDataDisposition')}
          </p>
          <p className="max-w-[560px] text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.syncConnection.onDemandDescription')}
          </p>
          <CheckboxField
            label={translate('settings.syncConnection.onDemandConfirm')}
            value={storageConfirmed}
            disabled={busy}
            onChange={setStorageConfirmed}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          type="submit"
          disabled={
            busy ||
            disabled ||
            running ||
            credentialsMissing ||
            (ready && !storageConfirmed) ||
            (discovery && selected === null) ||
            (allocation && (status?.workspace?.phase === 'allocating' || state.setupInvalidated)) ||
            (!status?.workspace && (!form.url || !form.account))
          }
        >
          {translate(`settings.syncConnection.${setupAction}`)}
        </ProductActionButton>
        {discovery ? (
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={busy || credentialsMissing}
            onClick={() => void controller.connect({ ...form, mode: 'join' }, onEnrolled)}
          >
            {translate('settings.syncConnection.repeatSearch')}
          </ProductActionButton>
        ) : null}
        {status?.workspace || state.message === 'abandonFailed' ? (
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

const checkpointLabels = {
  0: 'checkpointImmediate',
  60000: 'checkpointMinute',
  300000: 'checkpointFiveMinutes',
  900000: 'checkpointFifteenMinutes',
  1800000: 'checkpointThirtyMinutes',
  3600000: 'checkpointHour',
} as const;

function SyncCheckpointControls({
  state,
  controller,
  disabled,
}: {
  state: SyncConnectionViewState;
  controller: ReturnType<typeof createSyncConnectionController>;
  disabled: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const retryFocus = useRef(false);
  useEffect(() => {
    if (retryFocus.current && !state.busy && state.checkpointInterval !== null) {
      retryFocus.current = false;
      trigger.current?.focus();
    }
  }, [state.busy, state.checkpointInterval]);
  return (
    <div className="space-y-3">
      <SettingsControlRow
        label={translate('settings.syncConnection.checkpointInterval')}
        description={translate('settings.syncConnection.checkpointHint')}
      >
        <ProductSelect<string>
          ref={trigger}
          aria-label={translate('settings.syncConnection.checkpointInterval')}
          value={state.checkpointInterval === null ? '' : String(state.checkpointInterval)}
          placeholder={translate('settings.syncConnection.checkpointUnavailable')}
          options={SYNC_CHECKPOINT_INTERVALS.map((interval) => ({
            value: String(interval),
            label: translate(`settings.syncConnection.${checkpointLabels[interval]}`),
          }))}
          disabled={disabled || state.checkpointInterval === null}
          onChange={(value) => {
            const interval = SYNC_CHECKPOINT_INTERVALS.find((entry) => String(entry) === value);
            if (interval !== undefined) void controller.setCheckpointInterval(interval);
          }}
        />
      </SettingsControlRow>
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          disabled={disabled || state.status?.connection?.phase !== 'active'}
          onClick={() => void controller.flushCheckpoints()}
        >
          {translate('settings.syncConnection.checkpointSyncNow')}
        </ProductActionButton>
        {state.checkpointInterval === null ? (
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={disabled}
            onClick={() => {
              retryFocus.current = true;
              void controller.reloadStatus();
            }}
          >
            {translate('settings.syncConnection.checkpointRetry')}
          </ProductActionButton>
        ) : null}
      </div>
    </div>
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

function LocalOnlyConfirmation({
  state,
  controller,
}: {
  state: NonNullable<SyncConnectionViewState['localOnly']>;
  controller: ReturnType<typeof createSyncConnectionController>;
}) {
  const running = state.phase !== 'confirm';
  return (
    <ProductConfirmDialog
      title={translate('settings.syncConnection.localOnly')}
      confirmText={translate('settings.syncConnection.localOnlyConfirm')}
      cancelText={translate('common.actions.cancel')}
      confirmDisabled={running}
      isLoading={false}
      onCancel={() => controller.cancelLocalOnly()}
      onConfirm={() => {
        void controller.confirmLocalOnly();
      }}
      dialogClassName="sniptale-compact-workspace"
      message={
        <>
          <span className="block">{translate('settings.syncConnection.localOnlyDescription')}</span>
          <span className="mt-3 block">
            {translate('settings.syncConnection.remoteItems')}: {state.plan.missing.length}
          </span>
          <span className="block">
            {translate('settings.syncConnection.remoteSize')}:{' '}
            {formatBytes(state.plan.remoteBytesUpperBound, 1)}
          </span>
          <span className="mt-3 block">
            {translate('settings.syncConnection.localOnlySizeHint')}
          </span>
          <span className="mt-3 block">
            {translate('settings.syncConnection.localOnlyQueueHint')}
          </span>
          {running ? (
            <span role="status" className="mt-3 block">
              {translate(
                state.phase === 'cancelling'
                  ? 'settings.syncConnection.localOnlyCancelling'
                  : 'settings.syncConnection.localOnlyPreparing'
              )}
            </span>
          ) : null}
        </>
      }
    />
  );
}

/** Transient credentials stay in the form; the runtime owns connection readiness and enrollment. */
export function SyncConnectionSection() {
  useAppLocale();
  const secretProtection = useSettingsSecretProtection();
  const ensureUnlocked = useRef(() => secretProtection.ensureUnlocked('webdav'));
  ensureUnlocked.current = () => secretProtection.ensureUnlocked('webdav');
  const [state, setState] = useState<SyncConnectionViewState>({
    status: null,
    checkpointInterval: null,
    discovery: null,
    setupInvalidated: false,
    localPresence: 'loading',
    busy: false,
    message: null,
    catalogJob: null,
    localOnly: null,
  });
  const [controller] = useState(() =>
    createSyncConnectionController({
      client: createSyncProductClient(),
      ensureUnlocked: () => ensureUnlocked.current(),
      requestPermission: (origin) => browserPermissions.request({ origins: [`${origin}/*`] }),
      onChange: setState,
    })
  );
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  const section = useRef<HTMLElement>(null);
  const retryFocus = useRef(false);
  const { status, busy, message, catalogJob } = state;
  useEffect(() => {
    if (retryFocus.current && status !== null && !busy) {
      retryFocus.current = false;
      section.current
        ?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')
        ?.focus();
    }
  }, [status, busy]);
  const workspaceRunning = Boolean(status?.workspace && status.workspaceJob?.state === 'running');
  const workspaceFailure = getWorkspaceFailure(state);
  const disabled = busy || workspaceRunning || Boolean(catalogJob) || status === null;
  const ready = status?.workspace?.phase === 'ready' && !state.setupInvalidated;
  const connected = Boolean(status?.connection);

  const localOnlyFeedback = Boolean(message?.startsWith('localOnly'));
  const feedback = message ? (
    <p
      role={
        message === 'refreshing' ||
        message === 'refreshed' ||
        message === 'connectionResumed' ||
        message === 'credentialsSaved' ||
        message === 'serverAccessGranted' ||
        message === 'checkpointSaved' ||
        message === 'checkpointQueued' ||
        message === 'checkpointChecked' ||
        message === 'localOnlyReady' ||
        message === 'localOnlyCancelled'
          ? 'status'
          : 'alert'
      }
      className="text-sm"
    >
      {translate(`settings.syncConnection.${message}`)}
    </p>
  ) : null;

  return (
    <section
      ref={section}
      aria-label={translate('settings.syncConnection.title')}
      data-ui="settings.sync-connection"
      data-state={status === null ? (message ? 'unavailable' : 'loading') : 'ready'}
      aria-busy={busy || (status === null && !message)}
      className={`${settingsCompactWorkbenchClassName} max-w-[960px] space-y-4`}
    >
      <SettingsSecretProtectionParticipantSummary participant="webdav" />
      <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
        {translate(
          status === null
            ? message
              ? 'settings.syncConnection.statusUnavailable'
              : 'settings.syncConnection.statusLoading'
            : connected
              ? 'settings.syncConnection.connected'
              : 'settings.syncConnection.unconfigured'
        )}
      </p>
      {status?.connection ? <p className="break-all text-xs">{status.connection.rootUrl}</p> : null}
      {status?.workspace && !connected ? (
        <p className="break-all text-xs">{status.workspace.rootUrl}</p>
      ) : null}
      {localOnlyFeedback ? feedback : null}
      {status === null ? (
        message ? (
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              retryFocus.current = true;
              void controller.reloadStatus();
            }}
          >
            {translate('settings.syncConnection.statusRetry')}
          </ProductActionButton>
        ) : null
      ) : !connected ? (
        <SyncConnectionForm
          controller={controller}
          state={state}
          disabled={Boolean(catalogJob)}
          busy={busy}
          ready={ready}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={disabled || status?.connection?.phase !== 'active'}
            onClick={() => void controller.refresh()}
          >
            {translate('settings.syncConnection.refresh')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={disabled || status?.connection?.phase === 'updating-auth'}
            onClick={() => void controller.prepareLocalOnly()}
          >
            {translate('settings.syncConnection.localOnly')}
          </ProductActionButton>
        </div>
      )}
      {connected ? (
        <ConnectedCredentialControls state={state} controller={controller} disabled={disabled} />
      ) : null}
      {connected ? (
        <SyncCheckpointControls state={state} controller={controller} disabled={disabled} />
      ) : null}
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
        <div className="space-y-3">
          <p role="status">{translate('settings.syncConnection.paused')}</p>
          <ProductActionButton
            compact
            tone="secondary"
            type="button"
            disabled={disabled}
            onClick={() => void controller.resumeConnection()}
          >
            {translate('settings.syncConnection.resumeConnection')}
          </ProductActionButton>
        </div>
      ) : null}
      {workspaceFailure ? (
        <p role="alert" className="text-sm">
          {translate(`settings.syncConnection.${workspaceFailure}`)}
        </p>
      ) : null}
      {!localOnlyFeedback ? feedback : null}
      {state.localOnly ? (
        <LocalOnlyConfirmation state={state.localOnly} controller={controller} />
      ) : null}
    </section>
  );
}
