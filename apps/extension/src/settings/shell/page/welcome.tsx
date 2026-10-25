import { Camera, Check, Mic } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SUPPORTED_LOCALES, translate, usePageLocaleMetadata } from '../../../platform/i18n';
import { SettingsControlRow } from '../../section-surface';
import { useWelcomeSetup, type WelcomeDependencies } from '../../runtime/welcome';

type Setup = ReturnType<typeof useWelcomeSetup>;
const steps = [
  'settings.welcome.appearance',
  'settings.welcome.devices',
  'settings.welcome.ready',
] as const;

function deviceStatus(access: Setup['devices']['cameraAccess']) {
  if (access === 'granted') return translate('settings.welcome.granted');
  if (access === 'denied') return translate('settings.welcome.denied');
  if (access === 'device-busy') return translate('settings.welcome.busy');
  if (access === 'no-device') return translate('settings.welcome.noDevices');
  if (access === 'unavailable' || access === 'error') {
    return translate('settings.welcome.unavailable');
  }
  return translate('settings.welcome.prompt');
}

function AppearanceStep({ setup }: { setup: Setup }) {
  return (
    <div className="space-y-2">
      <SettingsControlRow label={translate('settings.appearance.languagePreferenceLabel')}>
        <ProductSelect
          data-ui="welcome.language"
          aria-label={translate('settings.appearance.languageSelectAriaLabel')}
          value={setup.locale}
          disabled={setup.busy}
          onChange={setup.setLocale}
          options={SUPPORTED_LOCALES.map((value) => ({
            value,
            label: translate(`common.languages.${value}`),
          }))}
        />
      </SettingsControlRow>
      <SettingsControlRow label={translate('settings.appearance.themeModeLabel')}>
        <ProductSelect
          data-ui="welcome.theme"
          aria-label={translate('settings.appearance.themeModeLabel')}
          value={setup.theme}
          disabled={setup.busy}
          onChange={setup.setTheme}
          options={[
            { value: 'system', label: translate('settings.appearance.systemOption') },
            { value: 'light', label: translate('settings.appearance.lightOption') },
            { value: 'dark', label: translate('settings.appearance.darkOption') },
          ]}
        />
      </SettingsControlRow>
    </div>
  );
}

function DeviceSetup({ setup, kind }: { setup: Setup; kind: 'microphone' | 'camera' }) {
  const microphone = kind === 'microphone';
  const devices = microphone ? setup.devices.microphones : setup.devices.cameras;
  const access = microphone ? setup.devices.microphoneAccess : setup.devices.cameraAccess;
  const selected = microphone ? setup.choice.microphoneDeviceId : setup.choice.webcamDeviceId;
  const name = translate(microphone ? 'settings.welcome.microphone' : 'settings.welcome.camera');
  const options = devices.map((device) => ({
    value: device.deviceId,
    label:
      device.label ||
      translate(
        microphone ? 'settings.welcome.unnamedMicrophone' : 'settings.welcome.unnamedCamera'
      ),
  }));
  return (
    <section className="space-y-2" aria-label={name} data-ui={`welcome.${kind}`}>
      <h3 className="flex items-center gap-2 text-[14px] leading-5 font-medium">
        {microphone ? (
          <Mic size={16} aria-hidden="true" />
        ) : (
          <Camera size={16} aria-hidden="true" />
        )}
        {name}
      </h3>
      <p className="text-[13px] leading-5 text-[var(--sniptale-color-text-secondary)]">
        {translate(
          microphone ? 'settings.welcome.microphonePurpose' : 'settings.welcome.cameraPurpose'
        )}
      </p>
      <p
        role="status"
        className="text-[13px] leading-5 text-[var(--sniptale-color-text-secondary)]"
      >
        {deviceStatus(access)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={setup.busy || setup.loading}
          data-ui={`welcome.${kind}-allow`}
          onClick={() => void setup.request(kind)}
        >
          {translate(
            microphone ? 'settings.welcome.allowMicrophone' : 'settings.welcome.allowCamera'
          )}
        </ProductActionButton>
        <div className="min-w-0 flex-1 basis-[240px]">
          <ProductSelect
            aria-label={name}
            data-ui={`welcome.${kind}-device`}
            disabled={setup.busy || setup.loading || access !== 'granted'}
            value={selected ?? ''}
            onChange={microphone ? setup.chooseMicrophone : setup.chooseCamera}
            options={[
              {
                value: '',
                label: translate(
                  microphone
                    ? 'settings.voiceInput.microphoneDefault'
                    : 'settings.welcome.defaultCamera'
                ),
              },
              ...options,
              ...(selected && !options.some((item) => item.value === selected)
                ? [{ value: selected, label: translate('settings.welcome.selectedUnavailable') }]
                : []),
            ]}
          />
        </div>
      </div>
      {access === 'granted' && devices.length === 0 ? (
        <p className="text-[13px] leading-5 text-[var(--sniptale-color-text-secondary)]">
          {translate('settings.welcome.noDevices')}
        </p>
      ) : null}
    </section>
  );
}

function WelcomeNavigation({ setup, onFinish }: { setup: Setup; onFinish(): void }) {
  return (
    <footer
      className={[
        'flex flex-wrap items-center justify-between gap-2 border-t pt-4',
        'border-[var(--sniptale-color-border-soft)]',
      ].join(' ')}
    >
      <ProductActionButton compact tone="secondary" data-ui="welcome.skip" onClick={onFinish}>
        {translate('settings.welcome.skip')}
      </ProductActionButton>
      <div className="flex flex-wrap gap-2">
        {setup.step > 0 ? (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={setup.busy}
            data-ui="welcome.back"
            onClick={setup.back}
          >
            {translate('settings.welcome.back')}
          </ProductActionButton>
        ) : null}
        <ProductActionButton
          compact
          data-ui="welcome.next"
          disabled={setup.busy || (setup.step === 1 && (setup.loading || setup.error === 'load'))}
          onClick={() => (setup.step === 2 ? onFinish() : void setup.next())}
        >
          {translate(
            setup.busy
              ? 'settings.welcome.saving'
              : setup.step === 2
                ? 'settings.welcome.finish'
                : 'settings.welcome.next'
          )}
        </ProductActionButton>
      </div>
    </footer>
  );
}

/** First-run presentation inside the existing Settings runtime and theme shell. */
export function WelcomePage({
  dependencies,
  onFinish = () => {
    window.location.replace('index.html?section=interface-browser&view=interface');
  },
}: { dependencies?: WelcomeDependencies; onFinish?(): void } = {}) {
  const setup = useWelcomeSetup(dependencies);
  const heading = useRef<HTMLHeadingElement>(null);
  usePageLocaleMetadata('settings.welcome.documentTitle');
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [setup.step]);
  return (
    <main
      data-ui="settings.welcome.root"
      className={[
        'sniptale-extension-surface sniptale-settings-workspace min-h-full w-full',
        'text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-6 px-6 py-8">
        <header className="space-y-2">
          <h1 className="text-[22px] leading-8 font-medium">
            {translate('settings.welcome.title')}
          </h1>
          <p className="text-[14px] leading-5 text-[var(--sniptale-color-text-secondary)]">
            {translate('settings.welcome.description')}
          </p>
        </header>
        <ol
          aria-label={translate('settings.welcome.progress')}
          className="grid grid-cols-3 gap-4 border-b border-[var(--sniptale-color-border-soft)] pb-4"
        >
          {steps.map((key, index) => (
            <li
              key={key}
              aria-current={setup.step === index ? 'step' : undefined}
              className={`flex items-center gap-2 text-[13px] leading-5 ${
                setup.step === index
                  ? 'text-[var(--sniptale-color-text-primary)]'
                  : 'text-[var(--sniptale-color-text-secondary)]'
              }`}
            >
              {setup.step > index ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <span>{index + 1}.</span>
              )}
              {translate(key)}
            </li>
          ))}
        </ol>
        <section className="min-w-0 space-y-4" aria-labelledby="welcome-step-heading">
          <h2
            id="welcome-step-heading"
            ref={heading}
            tabIndex={-1}
            className="text-[16px] leading-6 font-medium focus:outline-none"
          >
            {translate(steps[setup.step])}
          </h2>
          {setup.error ? (
            <p role="alert" className="text-[14px] leading-5 text-[var(--sniptale-color-danger)]">
              {translate(
                setup.error === 'load' ? 'settings.welcome.loadError' : 'settings.welcome.saveError'
              )}
            </p>
          ) : null}
          {setup.error === 'load' ? (
            <ProductActionButton
              compact
              tone="secondary"
              disabled={setup.busy || setup.loading}
              onClick={() => void setup.retry()}
            >
              {translate('settings.welcome.retry')}
            </ProductActionButton>
          ) : null}
          {setup.step === 0 ? <AppearanceStep setup={setup} /> : null}
          {setup.step === 1 ? (
            <div className="space-y-6">
              <p className="text-[13px] leading-5 text-[var(--sniptale-color-text-secondary)]">
                {translate('settings.welcome.optional')}
              </p>
              {setup.loading ? <p role="status">{translate('settings.welcome.loading')}</p> : null}
              <DeviceSetup setup={setup} kind="microphone" />
              <DeviceSetup setup={setup} kind="camera" />
            </div>
          ) : null}
          {setup.step === 2 ? (
            <p className="text-[14px] leading-5 text-[var(--sniptale-color-text-secondary)]">
              {translate('settings.welcome.readyDescription')}
            </p>
          ) : null}
        </section>
        <WelcomeNavigation setup={setup} onFinish={onFinish} />
      </div>
    </main>
  );
}
