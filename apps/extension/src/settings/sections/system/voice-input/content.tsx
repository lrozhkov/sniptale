import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { AlertCircle, ChevronDown, Download, Info, Mic, Square } from 'lucide-react';
import { AudioAmplitudeBars } from '@sniptale/ui/audio-amplitude-bars';
import { ProductSelect, ProductTextarea } from '@sniptale/ui/product-form-controls';
import { usePushToTalk } from '@sniptale/ui/voice-input/use-push-to-talk';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import {
  settingsCompactWorkbenchClassName,
  SettingsControlRow,
  settingsSectionClassName,
} from '../../../section-surface';
import { VoiceModelPreferences } from './model-preferences';
import { VoiceInputHistoryPanel } from './history';
import type { VoiceInputSettingsController } from './controller-contract';

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
    'processing-asr': 'settings.voiceInput.phaseProcessingAsr',
    'processing-text': 'settings.voiceInput.phaseProcessingText',
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
    'processing-asr': 'settings.voiceInput.phaseProcessingAsrDescription',
    'processing-text': 'settings.voiceInput.phaseProcessingTextDescription',
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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 py-1.5">
      <p className="text-[13px] font-normal leading-[18px] text-[var(--sniptale-color-text-muted)]">
        {props.label}
      </p>
      <div
        className={[
          'flex items-center justify-end gap-2 text-[13px] leading-[18px]',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {props.error ? (
          <AlertCircle aria-hidden="true" className="h-4 w-4 text-[var(--sniptale-color-danger)]" />
        ) : null}
        {props.value}
      </div>
      {props.description ? (
        <p className="col-span-2 text-xs leading-4 text-[var(--sniptale-color-text-muted)]">
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
  if (args.errorCode === 'service-not-allowed') {
    return translate('settings.voiceInput.errorServiceNotAllowed');
  }
  if (args.errorCode === 'network') {
    return translate('settings.voiceInput.errorNetwork');
  }
  if (args.errorCode === 'model-unavailable') return translate('settings.voiceInput.errorModel');
  if (args.errorCode === 'provider-failed') return translate('settings.voiceInput.errorProvider');
  if (args.errorCode === 'storage-failed' || args.errorCode === 'too-large')
    return translate('settings.voiceInput.historyError');
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
      controller.status.snapshot.phase === 'listening')
  );
}

function VoiceInputStatusGrid({ controller }: { controller: VoiceInputSettingsController }) {
  const effectiveMode = controller.status.snapshot.effectiveMode;
  const effectiveDescription =
    effectiveMode === 'model'
      ? translate('settings.voiceInput.effectiveModel')
      : effectiveMode === 'local'
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
      className={`${settingsCompactWorkbenchClassName} grid divide-y divide-[var(--sniptale-color-border-subtle)]`}
      aria-live="polite"
    >
      {controller.preferences.backend === 'browser' ? (
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
      ) : null}
      <StatusCard
        label={translate('settings.voiceInput.microphoneStatus')}
        value={translate(statusKey(controller.status.microphoneAccess))}
        description={microphoneDescription}
        error={microphoneError}
      />
      {controller.preferences.backend === 'browser' ? (
        <StatusCard
          label={translate('settings.voiceInput.packageStatus')}
          value={translate(
            controller.status.snapshot.localAvailability === 'unavailable'
              ? 'settings.voiceInput.localPackageUnavailable'
              : statusKey(controller.status.snapshot.localAvailability)
          )}
          description={
            controller.status.snapshot.localAvailability === 'unavailable'
              ? translate('settings.voiceInput.localPackageUnavailableDescription')
              : ''
          }
          error={controller.status.snapshot.localAvailability === 'unsupported'}
        />
      ) : null}
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
      {controller.preferences.backend === 'browser' ? (
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
      ) : null}
      {controller.preferences.backend === 'browser' ? (
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
      ) : null}
    </div>
  );
}

function VoiceInputActions({
  active,
  controller,
  installAvailable,
  pending,
}: {
  active: boolean;
  pending: boolean;
  controller: VoiceInputSettingsController;
  installAvailable: boolean;
}) {
  const startDisabled =
    pending ||
    (controller.preferences.backend === 'model' &&
      controller.models.transcriptionSelectionId === null) ||
    (controller.preferences.backend === 'model' &&
      controller.preferences.correction.enabled &&
      controller.models.correctionSelectionId === null) ||
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
        <ProductActionButton
          compact
          tone="secondary"
          type="button"
          onClick={() => void controller.actions.requestMicrophone()}
        >
          <Mic aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.allowMicrophone')}
        </ProductActionButton>
      ) : null}
      {installAvailable ? (
        <ProductActionButton
          compact
          tone="secondary"
          disabled={
            controller.status.installing ||
            controller.status.snapshot.localAvailability === 'downloading'
          }
          type="button"
          onClick={() => void controller.actions.installPackage()}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {translate('settings.voiceInput.install')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton
        compact
        tone="primary"
        data-ui={active ? 'settings.voice.stop' : 'settings.voice.start'}
        disabled={!active && startDisabled}
        type="button"
        onClick={(event) => {
          if (event.detail !== 0) return;
          if (active) controller.actions.stop();
          else void controller.actions.start();
        }}
        onPointerCancel={pushToTalk.onPointerCancel}
        onPointerDown={(event) => {
          if (active) {
            if (event.button === 0) controller.actions.stop();
          } else pushToTalk.onPointerDown(event);
        }}
        onPointerUp={pushToTalk.onPointerUp}
      >
        {active ? (
          <Square aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Mic aria-hidden="true" className="h-4 w-4" />
        )}
        {pushToTalk.holding
          ? translate('settings.voiceInput.releaseToStop')
          : active
            ? translate('settings.voiceInput.stop')
            : translate('settings.voiceInput.start')}
      </ProductActionButton>
      {pending ? (
        <ProductActionButton
          compact
          tone="secondary"
          data-ui="settings.voice.cancel"
          onClick={controller.actions.cancel}
        >
          {translate('settings.voiceInput.cancel')}
        </ProductActionButton>
      ) : null}
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
      aria-label={translate('settings.voiceInput.signalAriaLabel')}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      aria-valuetext={signalStatus}
      className={
        'relative flex h-10 items-center justify-center overflow-hidden rounded-[4px] ' +
        'bg-[var(--sniptale-color-surface-input)] px-10'
      }
      role="meter"
    >
      <AudioAmplitudeBars
        active={active}
        className="h-5"
        peaks={peaks}
        soundDetected={soundDetected}
      />
      <output className="absolute right-3 text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
        {percent}%
      </output>
    </div>
  );
}

function VoiceInputTestPanel({
  active,
  pending,
  controller,
}: {
  active: boolean;
  pending: boolean;
  controller: VoiceInputSettingsController;
}) {
  const transcript = `${controller.transcript.finalText}${controller.transcript.interimText}`;
  const installAvailable =
    !active &&
    controller.status.microphoneAccess === 'granted' &&
    controller.preferences.backend === 'browser' &&
    controller.preferences.mode === 'local-first' &&
    (controller.status.snapshot.localAvailability === 'downloadable' ||
      controller.status.snapshot.localAvailability === 'downloading');
  return (
    <div className={`${settingsCompactWorkbenchClassName} @container/voice-test`}>
      <div className="grid grid-cols-2 gap-4" data-ui="settings.voice.test-grid">
        <div className="min-w-0 space-y-2" data-ui="settings.voice.microphone-test">
          <h2
            className={[
              'text-[14px] leading-5 font-[var(--sniptale-font-weight-interface-heading)]',
              'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {translate('settings.voiceInput.testTitle')}
          </h2>
          <VoiceInputLevelMeter
            active={active}
            level={controller.status.audioLevel}
            peaks={controller.status.audioPeaks}
          />
          <VoiceInputActions
            active={active}
            controller={controller}
            installAvailable={installAvailable}
            pending={pending}
          />
        </div>
        <div
          className={
            'flex min-w-0 flex-col gap-2 pt-[26px] text-[13px] leading-[18px] ' +
            'text-[var(--sniptale-color-text-secondary)]'
          }
        >
          <ProductTextarea
            aria-label={translate('settings.voiceInput.textareaLabel')}
            className="!min-h-28 w-full flex-1 resize-y !text-[13px] !leading-5"
            placeholder={translate('settings.voiceInput.textareaPlaceholder')}
            readOnly={active || pending}
            value={transcript}
            onChange={(event) => controller.transcript.setFinalText(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export function VoiceInputSettingsContent(controller: VoiceInputSettingsController) {
  const active = isActive(controller);
  const phase = controller.status.snapshot.phase;
  const pending = phase === 'stopping' || phase === 'processing-asr' || phase === 'processing-text';
  return (
    <section className={settingsSectionClassName}>
      <ErrorNotice
        error={controller.status.error}
        busyOwner={controller.status.snapshot.busyOwner}
        errorCode={controller.status.snapshot.errorCode}
      />

      <div
        className={
          controller.preferences.enabled !== false && controller.preferences.backend === 'model'
            ? 'grid grid-cols-[minmax(0,1fr)_minmax(240px,300px)] items-start gap-4'
            : ''
        }
        data-ui="settings.voice.layout"
      >
        <div className="min-w-0 space-y-4">
          <VoiceModelPreferences
            controller={controller}
            disabled={active || pending || controller.preferences.saving}
          />
          {controller.preferences.enabled !== false ? (
            <>
              <VoiceInputPreferencesPanel active={active || pending} controller={controller} />
              <VoiceInputTestPanel active={active} pending={pending} controller={controller} />
              <details className={`${settingsCompactWorkbenchClassName} group/voice-status`}>
                <summary
                  className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-[4px] px-2
          text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]
          hover:bg-[var(--sniptale-color-surface-hover)] [&::-webkit-details-marker]:hidden"
                >
                  <Info size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    {translate('settings.voiceInput.diagnosticsTitle')}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className="group-open/voice-status:rotate-180"
                  />
                </summary>
                <div className="pl-[30px] pr-2 pt-2">
                  <VoiceInputStatusGrid controller={controller} />
                  {controller.preferences.backend === 'browser' ? (
                    <div className="space-y-1 pt-2 text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
                      <p>{translate('settings.voiceInput.localDisclosure')}</p>
                      <p>{translate('settings.voiceInput.browserDisclosure')}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            </>
          ) : null}
        </div>
        {controller.preferences.enabled !== false && controller.preferences.backend === 'model' ? (
          <aside
            className={[
              'sticky top-0 flex h-[calc(100dvh-124px)] min-h-0 min-w-0 flex-col overflow-hidden border-l pl-4',
              'border-[var(--sniptale-color-border-subtle)]',
            ].join(' ')}
            aria-label={translate('settings.voiceInput.historyTitle')}
          >
            <VoiceInputHistoryPanel
              showRetry={controller.preferences.backend === 'model'}
              refreshToken={phase}
              canRetry={controller.models.transcriptionSelectionId !== null}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
