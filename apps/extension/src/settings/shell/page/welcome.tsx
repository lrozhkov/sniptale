import './welcome.css';
import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Globe2,
  Mic,
  Monitor,
  MoonStar,
  SunMedium,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { SUPPORTED_LOCALES, translate, usePageLocaleMetadata } from '../../../platform/i18n';
import { useWelcomeSetup, type WelcomeDependencies } from '../../runtime/welcome';

type Setup = ReturnType<typeof useWelcomeSetup>;
const deviceCopy = {
  microphone: {
    name: 'settings.welcome.microphone',
    purpose: 'settings.welcome.microphonePurpose',
    allow: 'settings.welcome.allowMicrophone',
  },
  camera: {
    name: 'settings.welcome.camera',
    purpose: 'settings.welcome.cameraPurpose',
    allow: 'settings.welcome.allowCamera',
  },
} as const;
const themeOptions = [
  { value: 'system', label: 'settings.appearance.systemOption', Icon: Monitor },
  { value: 'light', label: 'settings.appearance.lightOption', Icon: SunMedium },
  { value: 'dark', label: 'settings.appearance.darkOption', Icon: MoonStar },
] as const;

function deviceStatus(access: Setup['access']['camera']) {
  if (access === 'granted') return translate('settings.welcome.granted');
  if (access === 'denied') return translate('settings.welcome.denied');
  if (access === 'device-busy') return translate('settings.welcome.busy');
  if (access === 'no-device') return translate('settings.welcome.noDevices');
  if (access === 'unavailable' || access === 'error')
    return translate('settings.welcome.unavailable');
  return translate('settings.welcome.prompt');
}

function AppearanceStep({ setup }: { setup: Setup }) {
  return (
    <div className="welcome-appearance">
      <div className="welcome-intro">
        <h1 id="welcome-step-heading" tabIndex={-1} className="welcome-heading">
          {translate('settings.welcome.title')}
        </h1>
        <p>{translate('settings.welcome.description')}</p>
      </div>
      <div className="welcome-choices">
        <fieldset data-ui="welcome.language">
          <legend>{translate('settings.welcome.languageLabel')}</legend>
          <div className="welcome-languages">
            {SUPPORTED_LOCALES.map((value) => (
              <button
                key={value}
                type="button"
                className="welcome-choice welcome-language"
                aria-pressed={setup.locale === value}
                disabled={setup.busy}
                onClick={() => setup.setLocale(value)}
              >
                {translate(`common.languages.${value}`, value)}
                {setup.locale === value ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset data-ui="welcome.theme">
          <legend>{translate('settings.welcome.themeLabel')}</legend>
          <div className="welcome-themes">
            {themeOptions.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                className="welcome-choice welcome-theme"
                aria-pressed={setup.theme === value}
                disabled={setup.busy}
                onClick={() => setup.setTheme(value)}
              >
                <span
                  className="welcome-theme-sample"
                  data-theme-preview={value}
                  aria-hidden="true"
                >
                  <Icon size={24} />
                </span>
                <span>{translate(label)}</span>
                {setup.theme === value ? (
                  <Check className="welcome-choice-check" size={14} aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function PermissionSetup({
  setup,
  kind,
}: {
  setup: Setup;
  kind: 'microphone' | 'camera' | 'origins';
}) {
  const sites = kind === 'origins';
  const access = setup.access[kind];
  const granted = access === 'granted';
  const Icon = sites ? Globe2 : kind === 'microphone' ? Mic : Camera;
  const name = translate(sites ? 'settings.welcome.pageTools' : deviceCopy[kind].name);
  return (
    <section aria-label={name} data-ui={`welcome.${kind}`} className="welcome-device-row">
      <span className="welcome-device-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <div className="welcome-device-copy">
        <h2>{name}</h2>
        <p>{translate(sites ? 'settings.welcome.pageToolsPurpose' : deviceCopy[kind].purpose)}</p>
        <p role="status" className="welcome-device-status">
          {granted ? <Check size={13} aria-hidden="true" /> : null}
          {sites && access === 'error'
            ? translate('settings.welcome.pageAccessError')
            : deviceStatus(access)}
        </p>
      </div>
      <div className="welcome-device-action">
        {!granted ? (
          <button
            type="button"
            className="welcome-permission-button"
            disabled={setup.busy || setup.loading}
            data-ui={`welcome.${kind}-allow`}
            onClick={() => void setup.request(kind)}
          >
            {translate(sites ? 'popup.home.alwaysEnableAllSites' : deviceCopy[kind].allow)}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const settingsPath = 'index.html?section=interface-browser&view=interface';
function PinStep() {
  return (
    <div className="welcome-pin">
      <div className="welcome-pin-copy">
        <h1 id="welcome-step-heading" tabIndex={-1} className="welcome-heading">
          {translate('settings.welcome.pinTitle')}
        </h1>
        <p>{translate('settings.welcome.pinDescription')}</p>
        <ol>
          <li>{translate('settings.welcome.pinMenu')}</li>
          <li>{translate('settings.welcome.pinAction')}</li>
        </ol>
        <p>{translate('settings.welcome.moreSettings')}</p>
        <a data-ui="welcome.settings-link" href={settingsPath}>
          {translate('settings.welcome.allSettings')}
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      <img
        data-ui="welcome.pin-illustration"
        src="/welcome/pin-extension.webp"
        width={768}
        height={512}
        alt={translate('settings.welcome.pinIllustration')}
      />
    </div>
  );
}

function WelcomeNavigation({ setup, onFinish }: { setup: Setup; onFinish(): void }) {
  return (
    <footer className="welcome-navigation">
      {setup.step < 2 ? (
        <ProductActionButton tone="secondary" data-ui="welcome.skip" onClick={onFinish}>
          {translate('settings.welcome.skip')}
        </ProductActionButton>
      ) : (
        <span />
      )}
      <div className="welcome-navigation-actions">
        {setup.step > 0 ? (
          <ProductActionButton
            tone="secondary"
            disabled={setup.busy}
            data-ui="welcome.back"
            onClick={setup.back}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {translate('settings.welcome.back')}
          </ProductActionButton>
        ) : null}
        <button
          type="button"
          data-ui="welcome.next"
          className="welcome-primary"
          disabled={setup.busy || (setup.step === 1 && (setup.loading || setup.error === 'load'))}
          onClick={() => (setup.step === 2 ? onFinish() : setup.next())}
        >
          {translate(
            setup.busy
              ? 'settings.welcome.saving'
              : setup.step < 2
                ? 'settings.welcome.nextDevices'
                : 'settings.welcome.finish'
          )}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function finishWelcome() {
  window.location.replace(settingsPath);
}

/** First-run appearance, optional access, and browser pinning guidance. */
export function WelcomePage({
  dependencies,
  onFinish = finishWelcome,
}: { dependencies?: WelcomeDependencies; onFinish?(): void } = {}) {
  const setup = useWelcomeSetup(dependencies);
  const body = useRef<HTMLElement>(null);
  const completed = useRef(false);
  usePageLocaleMetadata('settings.welcome.documentTitle');
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    body.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [setup.step]);
  useEffect(() => {
    if (setup.error && body.current) body.current.scrollTop = 0;
  }, [setup.error]);
  return (
    <main
      data-ui="settings.welcome.root"
      className="sniptale-extension-surface sniptale-settings-workspace sniptale-welcome"
    >
      <div className="welcome-frame">
        <header className="welcome-brand">
          <div>
            <img src="/icons/icon-128.png" alt="" width={36} height={36} />
            <span>{PRODUCT_BRAND_NAME}</span>
          </div>
          <div
            className="welcome-progress"
            role="progressbar"
            aria-label={translate('settings.welcome.progress')}
            aria-valuemin={1}
            aria-valuemax={3}
            aria-valuenow={setup.step + 1}
          >
            <i data-current="true" />
            <i data-current={setup.step >= 1 ? 'true' : 'false'} />
            <i data-current={setup.step === 2 ? 'true' : 'false'} />
            <span>{setup.step + 1} / 3</span>
          </div>
        </header>
        <section
          ref={body}
          data-ui="welcome.body"
          aria-labelledby="welcome-step-heading"
          className="welcome-body"
        >
          {setup.error ? (
            <div className="welcome-error">
              <p role="alert">
                {translate(
                  setup.error === 'load'
                    ? 'settings.welcome.loadError'
                    : 'settings.welcome.saveError'
                )}
              </p>
              {setup.error === 'load' ? (
                <ProductActionButton
                  tone="secondary"
                  disabled={setup.busy || setup.loading}
                  onClick={() => void setup.retry()}
                >
                  {translate('settings.welcome.retry')}
                </ProductActionButton>
              ) : null}
            </div>
          ) : null}
          {setup.step === 0 ? (
            <AppearanceStep setup={setup} />
          ) : setup.step === 2 ? (
            <PinStep />
          ) : (
            <div className="welcome-device-step">
              <div className="welcome-device-intro">
                <h1 id="welcome-step-heading" tabIndex={-1} className="welcome-heading">
                  {translate('settings.welcome.devicesTitle')}
                </h1>
              </div>
              {setup.loading ? <p role="status">{translate('settings.welcome.loading')}</p> : null}
              <div className="welcome-device-pair">
                <PermissionSetup setup={setup} kind="microphone" />
                <PermissionSetup setup={setup} kind="camera" />
                <PermissionSetup setup={setup} kind="origins" />
              </div>
              <p className="welcome-permission-help">
                {translate(
                  setup.access.microphone === 'denied' || setup.access.camera === 'denied'
                    ? 'settings.welcome.deniedHelp'
                    : 'settings.welcome.optional'
                )}
              </p>
            </div>
          )}
        </section>
        <WelcomeNavigation
          setup={setup}
          onFinish={() => {
            if (!completed.current) {
              completed.current = true;
              onFinish();
            }
          }}
        />
      </div>
    </main>
  );
}
