import { AlertCircle, CheckCircle2, Download, Mic, RefreshCw, Square } from 'lucide-react';
import { AudioAmplitudeBars } from '@sniptale/ui/audio-amplitude-bars';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { usePushToTalk } from '@sniptale/ui/voice-input/use-push-to-talk';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import {
  settingsCompactWorkbenchClassName,
  SettingsControlRow,
  settingsSectionClassName,
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
const textareaClassName = [
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
    <div className="min-w-0 py-2.5">
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
      className="flex max-w-[720px] gap-3 text-sm text-[var(--sniptale-color-danger)]"
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
      className={`${settingsCompactWorkbenchClassName} grid gap-x-8 sm:grid-cols-2`}
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
    <div className={`${settingsCompactWorkbenchClassName} space-y-1`}>
      <SettingsControlRow label={translate('settings.voiceInput.microphoneLabel')}>
        <ProductSelect
          aria-label={translate('settings.voiceInput.microphoneLabel')}
          disabled={active || controller.preferences.saving || controller.status.microphonesLoading}
          value={controller.preferences.microphoneDeviceId ?? ''}
          onChange={(value) => {
            void controller.preferences.setMicrophoneDeviceId(value || null);
          }}
          options={[
            { value: '', label: translate('settings.voiceInput.microphoneDefault') },
            ...(controller.preferences.microphoneDeviceId &&
            !controller.status.microphones.some(
              (device) => device.deviceId === controller.preferences.microphoneDeviceId
            )
              ? [
                  {
                    value: controller.preferences.microphoneDeviceId,
                    label: translate('settings.voiceInput.microphoneUnavailable'),
                  },
                ]
              : []),
            ...controller.status.microphones.map((device, index) => ({
              value: device.deviceId,
              label:
                device.label ||
                `${translate('settings.voiceInput.microphoneFallback')} ${index + 1}`,
            })),
          ]}
        />
      </SettingsControlRow>
      <SettingsControlRow label={translate('settings.voiceInput.languageLabel')}>
        <ProductSelect
          aria-label={translate('settings.voiceInput.languageLabel')}
          disabled={
            active ||
            controller.preferences.saving ||
            controller.status.checking ||
            controller.status.installing
          }
          value={controller.preferences.language}
          onChange={(value) => {
            void controller.preferences.setLanguage(value === 'en-US' ? 'en-US' : 'ru-RU');
          }}
          options={[
            { value: 'ru-RU', label: translate('settings.voiceInput.languageRu') },
            { value: 'en-US', label: translate('settings.voiceInput.languageEn') },
          ]}
        />
      </SettingsControlRow>
      <SettingsControlRow label={translate('settings.voiceInput.modeLabel')}>
        <ProductSelect
          aria-label={translate('settings.voiceInput.modeLabel')}
          disabled={
            active ||
            controller.preferences.saving ||
            controller.status.checking ||
            controller.status.installing
          }
          value={controller.preferences.mode}
          onChange={(value) => {
            void controller.preferences.setMode(
              value === 'browser-managed' ? 'browser-managed' : 'local-first'
            );
          }}
          options={[
            { value: 'local-first', label: translate('settings.voiceInput.modeLocalFirst') },
            {
              value: 'browser-managed',
              label: translate('settings.voiceInput.modeBrowserManaged'),
            },
          ]}
        />
      </SettingsControlRow>
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
    <div className={`${settingsCompactWorkbenchClassName} space-y-4`}>
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
          className={`${textareaClassName} min-h-36 resize-y leading-6`}
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
          `${settingsCompactWorkbenchClassName} space-y-1`,
          'text-xs leading-5 text-[var(--sniptale-color-text-muted)]',
        ].join(' ')}
      >
        <p>{translate('settings.voiceInput.localDisclosure')}</p>
        <p>{translate('settings.voiceInput.browserDisclosure')}</p>
      </div>
    </section>
  );
}
