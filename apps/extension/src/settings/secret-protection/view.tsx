import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate } from '../../platform/i18n';
import { SettingsSwitch } from '../section-surface/panel-controls';
import {
  SettingsControlRow,
  settingsCompactWorkbenchClassName,
  settingsPanelClassName,
  settingsNeutralBadgeClassName,
} from '../section-surface';
import {
  getParticipantEnrollment,
  type SecretProtectionParticipant,
  type SecretProtectionState,
} from './controller';

/** Renders one domain membership without owning status or privileged commands. */
export function SecretProtectionParticipantRow(props: {
  participant: SecretProtectionParticipant;
  state: SecretProtectionState | null;
  onOpenConfiguration?: (() => void) | undefined;
}) {
  const enrolled = getParticipantEnrollment(props.state?.status ?? null, props.participant);
  const label = translate(
    props.participant === 'ai'
      ? 'settings.secretProtection.aiParticipant'
      : 'settings.secretProtection.webdavParticipant'
  );
  return (
    <SettingsControlRow
      valueClassName="flex flex-wrap items-center justify-end gap-2"
      label={label}
      description={translate(
        props.participant === 'ai'
          ? 'settings.secretProtection.aiParticipantDescription'
          : 'settings.secretProtection.webdavParticipantDescription'
      )}
    >
      <span className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate(
          enrolled === null
            ? 'settings.secretProtection.unknownStatus'
            : enrolled
              ? 'settings.secretProtection.participantEnabled'
              : 'settings.secretProtection.participantDisabled'
        )}
      </span>
      <SettingsSwitch
        aria-label={label}
        checked={enrolled === true}
        disabled={!props.state || enrolled === null || props.state.isBusy || props.state.isLoading}
        onClick={() =>
          enrolled
            ? props.state?.handleOpenDisableDialog(props.participant)
            : props.state?.handleOpenEnableDialog(props.participant)
        }
      />
      {props.onOpenConfiguration ? (
        <ProductActionButton
          compact
          type="button"
          tone="secondary"
          disabled={props.state?.isBusy}
          onClick={props.onOpenConfiguration}
        >
          {translate('settings.secretProtection.openSettingsAction')}
        </ProductActionButton>
      ) : null}
    </SettingsControlRow>
  );
}

/** Renders shared session actions and both independent domain controls. */
export function SecretProtectionView(props: { state: SecretProtectionState }) {
  const state = props.state;
  return (
    <section className={`${settingsCompactWorkbenchClassName} ${settingsPanelClassName}`}>
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('settings.secretProtection.title')}
      </h2>
      <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
        {translate(
          !state.status
            ? 'settings.secretProtection.unknownStatus'
            : state.status.isEnabled
              ? 'settings.secretProtection.passphraseDescription'
              : 'settings.secretProtection.transparentDescription'
        )}
      </p>
      <p role="status" className="mt-2 text-xs text-[var(--sniptale-color-text-muted)]">
        {translate(
          state.isLoading
            ? 'settings.secretProtection.loadingStatus'
            : !state.status
              ? 'settings.secretProtection.unknownStatus'
              : !state.status.isEnabled
                ? 'settings.secretProtection.offStatus'
                : state.status.isUnlocked
                  ? 'settings.secretProtection.unlockedStatus'
                  : 'settings.secretProtection.lockedStatus'
        )}
      </p>
      {state.error ? (
        <div className="mt-2">
          <p role="alert" className="sniptale-error-text">
            {state.error}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={state.isBusy || state.isLoading}
            onClick={() => void state.reloadStatus()}
          >
            {translate('settings.secretProtection.retryAction')}
          </ProductActionButton>
        </div>
      ) : null}
      <div className="mt-4 space-y-4">
        <SecretProtectionParticipantRow participant="ai" state={state} />
        <SecretProtectionParticipantRow participant="webdav" state={state} />
      </div>
      {state.status?.isEnabled ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={settingsNeutralBadgeClassName}>
              {translate('settings.secretProtection.modeLabel')}:{' '}
              {translate('settings.secretProtection.passphraseMode')}
            </span>
            <span className={settingsNeutralBadgeClassName}>
              {translate('settings.secretProtection.sessionLabel')}:{' '}
              {translate(
                state.status.isUnlocked
                  ? 'settings.secretProtection.sessionUnlocked'
                  : 'settings.secretProtection.sessionLocked'
              )}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ProductActionButton
              compact
              tone="secondary"
              disabled={state.isBusy}
              onClick={
                state.status.isUnlocked
                  ? () => void state.handleLockNow()
                  : state.handleOpenUnlockDialog
              }
            >
              {translate(
                state.status.isUnlocked
                  ? 'settings.secretProtection.lockAction'
                  : 'settings.secretProtection.unlockAction'
              )}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={state.isBusy}
              onClick={state.handleOpenChangeDialog}
            >
              {translate('settings.secretProtection.changeAction')}
            </ProductActionButton>
            <ProductActionButton
              compact
              tone="secondary"
              disabled={state.isBusy}
              onClick={state.handleOpenResetDialog}
            >
              {translate('settings.secretProtection.resetAction')}
            </ProductActionButton>
          </div>
        </>
      ) : null}
    </section>
  );
}
