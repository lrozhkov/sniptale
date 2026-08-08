import { AlertCircle, CheckCircle2, Download, Mic, RefreshCw, Square } from 'lucide-react';
import { AudioAmplitudeBars } from '@sniptale/ui/audio-amplitude-bars';
import { usePushToTalk } from '@sniptale/ui/voice-input/use-push-to-talk';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import {
  settingsPanelClassName,
  settingsSectionClassName,
  SettingsSectionHeader,
} from '../../../section-surface';
import type { VoiceInputSettingsController } from './controller-contract';

const buttonClassName = [
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] border px-4 py-2',
  'text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-accent)] disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');
const primaryButtonClassName = [
  buttonClassName,
  'border-[var(--sniptale-color-accent)] bg-[var(--sniptale-color-accent)] text-white',
].join(' ');
const secondaryButtonClassName = [
  buttonClassName,
  'border-[var(--sniptale-color-border-soft)] bg-transparent text-[var(--sniptale-color-text-primary)]',
  'hover:border-[var(--sniptale-color-border-strong)] hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');
const fieldClassName = [
  'w-full rounded-[14px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-canvas)] px-3 py-2 text-sm',
  'text-[var(--sniptale-color-text-primary)] focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-accent)] disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');
const activeMicrophoneIndicatorClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_14%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
  'ring-4 ring-[color:color-mix(in_srgb,var(--sniptale-color-accent)_8%,transparent)]',
].join(' ');
function statusKey(value: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    standard: 'settings.voiceInput.statusStandard',
    prefixed: 'settings.voiceInput.statusPrefixed',
    unsupported: 'settings.voiceInput.statusUnsupported',
    granted: 'settings.voiceInput.statusGranted',
    prompt: 'settings.voiceInput.statusPrompt',
    denied: 'settings.voiceInput.statusDenied',
    'no-device': 'settings.voiceInput.statusNoDevice',
    'device-busy': 'settings.voiceInput.statusDeviceBusy',
    unavailable: 'settings.voiceInput.statusUnavailable',
    unknown: 'settings.voiceInput.statusUnknown',
    available: 'settings.voiceInput.statusAvailable',
    downloadable: 'settings.voiceInput.statusDownloadable',
    downloading: 'settings.voiceInput.statusDownloading',
    idle: 'settings.voiceInput.phaseIdle',
    checking: 'settings.voiceInput.phaseChecking',
    installing: 'settings.voiceInput.phaseInstalling',
    starting: 'settings.voiceInput.phaseStarting',
    listening: 'settings.voiceInput.phaseListening',
    stopping: 'settings.voiceInput.phaseStopping',
    ended: 'settings.voiceInput.phaseEnded',
    error: 'settings.voiceInput.phaseError',
  };
  return keys[value] ?? 'settings.voiceInput.statusUnknown';
}

function phaseDescriptionKey(value: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    idle: 'settings.voiceInput.phaseIdleDescription',
    checking: 'settings.voiceInput.phaseCheckingDescription',
    installing: 'settings.voiceInput.phaseInstallingDescription',
    starting: 'settings.voiceInput.phaseStartingDescription',
    listening: 'settings.voiceInput.phaseListeningDescription',
    stopping: 'settings.voiceInput.phaseStoppingDescription',
    ended: 'settings.voiceInput.phaseEndedDescription',
    error: 'settings.voiceInput.phaseErrorDescription',
  };
  return keys[value] ?? 'settings.voiceInput.phaseIdleDescription';
}

function fallbackDescriptionKey(value: string): TranslationKey {
  const keys: Record<string, TranslationKey> = {
    'local-api-unsupported': 'settings.voiceInput.fallbackLocalApiUnsupported',
    'local-unavailable': 'settings.voiceInput.fallbackLocalUnavailable',
    'dictation-unsupported': 'settings.voiceInput.fallbackDictationUnsupported',
    'dictation-unavailable': 'settings.voiceInput.fallbackDictationUnavailable',
    'local-install-failed': 'settings.voiceInput.fallbackInstallFailed',
    'local-check-failed': 'settings.voiceInput.fallbackCheckFailed',
    'local-start-failed': 'settings.voiceInput.fallbackStartFailed',
  };
  return keys[value] ?? 'settings.voiceInput.fallbackLocalUnavailable';
}

function StatusCard(props: {
  label: string;
  value: string;
  description?: string;
  error?: boolean;
}) {
  return (
    <div
      className={[
        'min-w-0 border-b border-[var(--sniptale-color-border-soft)] py-3 last:border-b-0',
        'md:border-b-0 md:border-r md:px-4 md:first:pl-0 md:last:border-r-0 md:last:pr-0',
      ].join(' ')}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-muted)]">
        {props.label}
      </p>
      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {props.error ? (
          <AlertCircle aria-hidden="true" className="h-4 w-4 text-[var(--sniptale-color-danger)]" />
        ) : (
          <CheckCircle2
            aria-hidden="true"
            className="h-4 w-4 text-[var(--sniptale-color-success)]"
          />
        )}
        {props.value}
      </div>
      {props.description ? (
        <p className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {props.description}
        </p>
      ) : null}
    </div>
  );
}

function ErrorNotice({
  error,
  busyOwner,
  errorCode,
}: {
  busyOwner: string | null;
  error: VoiceInputSettingsController['status']['error'];
  errorCode: VoiceInputSettingsController['status']['snapshot']['errorCode'];
}) {
  const message = resolveErrorNoticeMessage({ busyOwner, error, errorCode });
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`${settingsPanelClassName} flex gap-3 text-sm text-[var(--sniptale-color-danger)]`}
    >
      <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function resolveErrorNoticeMessage(args: {
  busyOwner: string | null;
  error: VoiceInputSettingsController['status']['error'];
  errorCode: VoiceInputSettingsController['status']['snapshot']['errorCode'];
}): string | null {
  if (args.busyOwner === 'video-recording') return translate('settings.voiceInput.busyVideo');
  if (args.errorCode === 'busy-speech') return translate('settings.voiceInput.busySpeech');
  if (args.busyOwner === 'privacy-erasure') return translate('settings.voiceInput.busyPrivacy');
  if (args.errorCode === 'unsupported') return translate('settings.voiceInput.errorUnsupported');
  if (args.errorCode === 'no-speech') return translate('settings.voiceInput.errorNoSpeech');
  if (args.errorCode === 'microphone-unavailable' || args.errorCode === 'microphone-busy') {
    return translate('settings.voiceInput.errorMicrophone');
  }
  if (args.errorCode === 'permission-denied') {
    return translate('settings.voiceInput.permissionError');
  }
  if (args.errorCode === 'language-not-supported') {
    return translate('settings.voiceInput.errorLanguage');
  }
  if (args.errorCode === 'network' || args.errorCode === 'service-not-allowed') {
    return translate('settings.voiceInput.errorNetwork');
  }
  if (args.errorCode === 'timeout') return translate('settings.voiceInput.errorTimeout');
  if (args.error === 'permission') return translate('settings.voiceInput.permissionError');
  if (args.error === 'install') return translate('settings.voiceInput.installError');
  if (args.error === 'runtime') return translate('settings.voiceInput.runtimeError');
  return null;
}

function isActive(controller: VoiceInputSettingsController): boolean {
  return (
    controller.status.snapshot.sessionId !== null &&
    (controller.status.snapshot.phase === 'checking' ||
      controller.status.snapshot.phase === 'starting' ||
      controller.status.snapshot.phase === 'listening' ||
      controller.status.snapshot.phase === 'stopping')
  );
}

function VoiceInputStatusGrid({ controller }: { controller: VoiceInputSettingsController }) {
  const effectiveMode = controller.status.snapshot.effectiveMode;
  const effectiveDescription =
    effectiveMode === 'local'
      ? translate('settings.voiceInput.effectiveLocal')
      : effectiveMode === 'legacy'
        ? translate('settings.voiceInput.effectiveLegacy')
        : effectiveMode === 'browser-managed'
          ? translate('settings.voiceInput.effectiveBrowser')
          : undefined;
  const microphoneError =
    controller.status.microphoneAccess === 'denied' ||
    controller.status.microphoneAccess === 'no-device' ||
    controller.status.microphoneAccess === 'device-busy' ||
    controller.status.microphoneAccess === 'unavailable' ||
    (controller.preferences.microphoneDeviceId !== null &&
      !controller.status.microphones.some(
        (device) => device.deviceId === controller.preferences.microphoneDeviceId
      ));
  const selectedMicrophone = controller.status.microphones.find(
    (device) => device.deviceId === controller.preferences.microphoneDeviceId
  );
  const microphoneDescription =
    controller.preferences.microphoneDeviceId === null
      ? translate('settings.voiceInput.microphoneDefault')
      : selectedMicrophone?.label || translate('settings.voiceInput.microphoneUnavailable');
  const phaseDescription = translate(phaseDescriptionKey(controller.status.snapshot.phase));
  const fallbackDescription = controller.status.snapshot.fallbackReason
    ? translate(fallbackDescriptionKey(controller.status.snapshot.fallbackReason))
    : null;

  return (
    <div
      className={`${settingsPanelClassName} grid md:grid-cols-2 xl:grid-cols-4`}
      aria-live="polite"
    >
      <StatusCard
        label={translate('settings.voiceInput.apiStatus')}
        value={translate(statusKey(controller.status.snapshot.apiFlavor))}
        description={translate(
          controller.status.snapshot.qualitySupported
            ? 'settings.voiceInput.qualitySupported'
            : 'settings.voiceInput.qualityLegacy'
        )}
        error={controller.status.snapshot.apiFlavor === 'unsupported'}
      />
      <StatusCard
        label={translate('settings.voiceInput.microphoneStatus')}
        value={translate(statusKey(controller.status.microphoneAccess))}
        description={microphoneDescription}
        error={microphoneError}
      />
      <StatusCard
        label={translate('settings.voiceInput.packageStatus')}
        value={translate(statusKey(controller.status.snapshot.localAvailability))}
        error={controller.status.snapshot.localAvailability === 'unsupported'}
      />
      <StatusCard
        label={translate('settings.voiceInput.runtimeStatus')}
        value={translate(statusKey(controller.status.snapshot.phase))}
        description={[phaseDescription, effectiveDescription, fallbackDescription]
          .filter(Boolean)
          .join(' · ')}
        error={controller.status.snapshot.phase === 'error'}
      />
    </div>
  );
}

function VoiceInputPreferencesPanel({
  active,
  controller,
}: {
  active: boolean;
  controller: VoiceInputSettingsController;
}) {
  return (
    <div className={`${settingsPanelClassName} grid gap-5 md:grid-cols-3`}>
      <label className="space-y-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <span>{translate('settings.voiceInput.microphoneLabel')}</span>
        <select
          className={fieldClassName}
          disabled={active || controller.preferences.saving || controller.status.microphonesLoading}
          value={controller.preferences.microphoneDeviceId ?? ''}
          onChange={(event) => {
            void controller.preferences.setMicrophoneDeviceId(event.target.value || null);
          }}
        >
          <option value="">{translate('settings.voiceInput.microphoneDefault')}</option>
          {controller.preferences.microphoneDeviceId &&
          !controller.status.microphones.some(
            (device) => device.deviceId === controller.preferences.microphoneDeviceId
          ) ? (
            <option value={controller.preferences.microphoneDeviceId}>
              {translate('settings.voiceInput.microphoneUnavailable')}
            </option>
          ) : null}
          {controller.status.microphones.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label ||
                `${translate('settings.voiceInput.microphoneFallback')} ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <span>{translate('settings.voiceInput.languageLabel')}</span>
        <select
          className={fieldClassName}
          disabled={
            active ||
            controller.preferences.saving ||
            controller.status.checking ||
            controller.status.installing
          }
          value={controller.preferences.language}
          onChange={(event) => {
            void controller.preferences.setLanguage(
              event.target.value === 'en-US' ? 'en-US' : 'ru-RU'
            );
          }}
        >
          <option value="ru-RU">{translate('settings.voiceInput.languageRu')}</option>
          <option value="en-US">{translate('settings.voiceInput.languageEn')}</option>
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <span>{translate('settings.voiceInput.modeLabel')}</span>
        <select
          className={fieldClassName}
          disabled={
            active ||
            controller.preferences.saving ||
            controller.status.checking ||
            controller.status.installing
          }
          value={controller.preferences.mode}
          onChange={(event) => {
            void controller.preferences.setMode(
              event.target.value === 'browser-managed' ? 'browser-managed' : 'local-first'
            );
          }}
        >
          <option value="local-first">{translate('settings.voiceInput.modeLocalFirst')}</option>
          <option value="browser-managed">
            {translate('settings.voiceInput.modeBrowserManaged')}
          </option>
        </select>
      </label>
    </div>
  );
}

function VoiceInputActions({
  active,
  controller,
  installAvailable,
}: {
  active: boolean;
  controller: VoiceInputSettingsController;
  installAvailable: boolean;
}) {
  const startDisabled =
    controller.status.microphoneAccess !== 'granted' ||
    controller.status.checking ||
    controller.status.installing ||
    controller.status.microphonesLoading ||
    controller.preferences.saving ||
    (controller.preferences.microphoneDeviceId !== null &&
      !controller.status.microphones.some(
        (device) => device.deviceId === controller.preferences.microphoneDeviceId
      ));
  const pushToTalk = usePushToTalk({
    active,
    disabled: startDisabled,
    onStart: () => void controller.actions.start(),
    onStop: controller.actions.stop,
  });
  return (
    <div className="flex flex-wrap gap-2">
      {controller.status.microphoneAccess !== 'granted' ? (
        <button
          className={primaryButtonClassName}
          type="button"
          onClick={() => void controller.actions.requestMicrophone()}
        >
          <Mic aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.allowMicrophone')}
        </button>
      ) : null}
      {installAvailable ? (
        <button
          className={secondaryButtonClassName}
          disabled={
            controller.status.installing ||
            controller.status.snapshot.localAvailability === 'downloading'
          }
          type="button"
          onClick={() => void controller.actions.installPackage()}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.install')}
        </button>
      ) : null}
      <button
        className={primaryButtonClassName}
        disabled={!active && startDisabled}
        type="button"
        onClick={(event) => {
          if (event.detail === 0 && !active) void controller.actions.start();
        }}
        onPointerCancel={pushToTalk.onPointerCancel}
        onPointerDown={pushToTalk.onPointerDown}
        onPointerUp={pushToTalk.onPointerUp}
      >
        <Mic aria-hidden="true" className="h-4 w-4" />
        {pushToTalk.holding
          ? translate('settings.voiceInput.releaseToStop')
          : active
            ? translate('settings.voiceInput.microphoneActive')
            : translate('settings.voiceInput.start')}
      </button>
      {active ? (
        <button
          className={secondaryButtonClassName}
          type="button"
          onClick={controller.actions.stop}
        >
          <Square aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.stop')}
        </button>
      ) : null}
      <button
        className={secondaryButtonClassName}
        disabled={active || controller.status.checking}
        type="button"
        onClick={() => void controller.actions.refresh()}
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        {translate('settings.voiceInput.refresh')}
      </button>
    </div>
  );
}

function VoiceInputLevelMeter({
  active,
  level,
  peaks,
}: {
  active: boolean;
  level: number;
  peaks: readonly number[];
}) {
  const normalizedLevel = Math.max(0, Math.min(1, level));
  const percent = Math.round(normalizedLevel * 100);
  const soundDetected = active && normalizedLevel >= 0.04;
  const signalStatus = soundDetected
    ? translate('settings.voiceInput.signalDetected')
    : active
      ? translate('settings.voiceInput.signalListening')
      : translate('settings.voiceInput.signalIdle');
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-[12px] border px-3 py-2.5',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          active
            ? activeMicrophoneIndicatorClassName
            : 'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-muted)]',
        ].join(' ')}
      >
        <Mic className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-[var(--sniptale-color-text-primary)]">
            {translate('settings.voiceInput.signalLabel')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[var(--sniptale-color-text-muted)]">
            <span
              aria-hidden="true"
              className={[
                'h-1.5 w-1.5 rounded-full transition-colors duration-100',
                soundDetected
                  ? 'bg-[var(--sniptale-color-accent)]'
                  : active
                    ? 'bg-[var(--sniptale-color-success)]'
                    : 'bg-[var(--sniptale-color-text-muted)] opacity-50',
              ].join(' ')}
            />
            {signalStatus}
          </span>
        </div>
        <div
          aria-label={translate('settings.voiceInput.signalAriaLabel')}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className={[
            'relative mt-2 flex h-10 items-center justify-center overflow-hidden rounded-[10px] px-12',
            'bg-[var(--sniptale-color-surface-hover)]',
          ].join(' ')}
          role="meter"
        >
          <AudioAmplitudeBars
            active={active}
            className="h-7"
            peaks={peaks}
            soundDetected={soundDetected}
          />
          <output className="absolute right-3 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
            {percent}%
          </output>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--sniptale-color-text-muted)]">
          {translate('settings.voiceInput.signalPrivacy')}
        </p>
      </div>
    </div>
  );
}

function VoiceInputTestPanel({
  active,
  controller,
}: {
  active: boolean;
  controller: VoiceInputSettingsController;
}) {
  const transcript = `${controller.transcript.finalText}${controller.transcript.interimText}`;
  const installAvailable =
    !active &&
    controller.status.microphoneAccess === 'granted' &&
    controller.preferences.mode === 'local-first' &&
    (controller.status.snapshot.localAvailability === 'downloadable' ||
      controller.status.snapshot.localAvailability === 'downloading');
  return (
    <div className={`${settingsPanelClassName} space-y-4`}>
      <div>
        <h2 className="text-base font-semibold text-[var(--sniptale-color-text-primary-strong)]">
          {translate('settings.voiceInput.testTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.voiceInput.testDescription')}
        </p>
      </div>
      <label className="block space-y-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <span>{translate('settings.voiceInput.textareaLabel')}</span>
        <textarea
          className={`${fieldClassName} min-h-36 resize-y leading-6`}
          placeholder={translate('settings.voiceInput.textareaPlaceholder')}
          readOnly={active}
          value={transcript}
          onChange={(event) => controller.transcript.setFinalText(event.target.value)}
        />
      </label>
      <VoiceInputLevelMeter
        active={active}
        level={controller.status.audioLevel}
        peaks={controller.status.audioPeaks}
      />
      <VoiceInputActions
        active={active}
        controller={controller}
        installAvailable={installAvailable}
      />
    </div>
  );
}

export function VoiceInputSettingsContent(controller: VoiceInputSettingsController) {
  const active = isActive(controller);
  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.voiceInput.kicker')}
        title={translate('settings.voiceInput.title')}
        description={translate('settings.voiceInput.description')}
      />

      <VoiceInputStatusGrid controller={controller} />

      <ErrorNotice
        error={controller.status.error}
        busyOwner={controller.status.snapshot.busyOwner}
        errorCode={controller.status.snapshot.errorCode}
      />

      <VoiceInputPreferencesPanel active={active} controller={controller} />
      <VoiceInputTestPanel active={active} controller={controller} />

      <div
        className={[
          'space-y-1 border-l-2 border-[var(--sniptale-color-border-soft)] pl-3',
          'text-xs leading-5 text-[var(--sniptale-color-text-muted)]',
        ].join(' ')}
      >
        <p>{translate('settings.voiceInput.localDisclosure')}</p>
        <p>{translate('settings.voiceInput.browserDisclosure')}</p>
      </div>
    </section>
  );
}
