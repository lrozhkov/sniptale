import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductToggle, ProductInput } from '@sniptale/ui/product-form-controls';
import { GuideInspectorGroup } from '../inspector';
import { TourTextField } from './fields';
import type { Translate } from '../../../platform/i18n';

export function TourEndSettings({
  tour,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  const value = tour.endScreen;
  const change = (patch: Partial<TourDocument['endScreen']>) =>
    onChange({ ...tour, endScreen: { ...value, ...patch } });
  return (
    <GuideInspectorGroup icon={Flag} title={t('scenario.editor.tourEnd')}>
      <TourEndToggle tour={tour} disabled={disabled} onChange={onChange} t={t} />
      <TourTextField
        label={t('scenario.editor.guideStepTitle')}
        singleLine
        value={value.title}
        disabled={disabled}
        onChange={(title) => change({ title })}
      />
      <TourTextField
        label={t('scenario.editor.textLabel')}
        value={value.description}
        disabled={disabled}
        onChange={(description) => change({ description })}
      />
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourRestart')}
          checked={value.restart}
          onClick={() => change({ restart: !value.restart })}
        />
        {t('scenario.editor.tourRestart')}
      </label>
      <TourEndButton
        value={value.button}
        disabled={disabled}
        t={t}
        onChange={(button) => change({ button })}
      />
    </GuideInspectorGroup>
  );
}

/** Keeps incomplete CTA text local until its complete destination is accepted. */
function TourEndButton({
  value,
  disabled,
  onChange,
  t,
}: {
  value: TourDocument['endScreen']['button'];
  disabled: boolean;
  onChange: (button: TourDocument['endScreen']['button']) => boolean;
  t: Translate;
}) {
  const [enabled, setEnabled] = useState(Boolean(value));
  const [label, setLabel] = useState(value?.label ?? t('scenario.editor.tourButton'));
  const [url, setUrl] = useState(value?.url ?? '');
  const [invalid, setInvalid] = useState(false);
  const storedLabel = value?.label;
  const storedUrl = value?.url;
  const hasValue = Boolean(value);
  const defaultLabel = t('scenario.editor.tourButton');
  useEffect(() => setEnabled(hasValue), [hasValue]);
  useEffect(() => setLabel(storedLabel ?? defaultLabel), [storedLabel, defaultLabel]);
  useEffect(() => {
    setUrl(storedUrl ?? '');
    setInvalid(false);
  }, [storedUrl]);
  const commit = () => {
    if (!disabled) setInvalid(!onChange({ label, url }));
  };
  return (
    <div className="tour-text-field">
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourEndButton')}
          checked={enabled}
          onClick={() => {
            if (enabled && value && !onChange(null)) return;
            setEnabled(!enabled);
            setInvalid(false);
          }}
        />
        {t('scenario.editor.tourEndButton')}
      </label>
      {enabled && (
        <>
          <TourTextField
            singleLine
            label={t('scenario.editor.tourEndButtonLabel')}
            value={label}
            disabled={disabled}
            onChange={(next) => {
              setLabel(next);
              if (value) onChange({ ...value, label: next });
            }}
          />
          <ProductInput
            aria-label={t('scenario.editor.tourActionUrl')}
            value={url}
            disabled={disabled}
            placeholder="https://"
            maxLength={4000}
            aria-invalid={invalid}
            onChange={(event) => {
              setUrl(event.target.value);
              setInvalid(false);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              }
            }}
          />
          {invalid ? (
            <span role="alert">{t('scenario.editor.tourInvalidUrl')}</span>
          ) : (
            !value && (
              <span className="guide-inspector-hint">{t('scenario.editor.tourEndButtonHint')}</span>
            )
          )}
        </>
      )}
    </div>
  );
}

/** Disabling the terminal screen repairs only actions that explicitly target it. */
function TourEndToggle({
  tour,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  const [confirm, setConfirm] = useState(false);
  const linked = tour.slides.some((slide) =>
    (slide.kind === 'image' ? slide.hotspots : slide.buttons).some(
      (object) => object.action.kind === 'end'
    )
  );
  const disable = () =>
    onChange({
      ...tour,
      endScreen: { ...tour.endScreen, enabled: false },
      slides: tour.slides.map((slide) =>
        slide.kind === 'image'
          ? {
              ...slide,
              hotspots: slide.hotspots.map((object) =>
                object.action.kind === 'end'
                  ? { ...object, action: { kind: 'none' as const } }
                  : object
              ),
            }
          : {
              ...slide,
              buttons: slide.buttons.map((object) =>
                object.action.kind === 'end'
                  ? { ...object, action: { kind: 'none' as const } }
                  : object
              ),
            }
      ),
    });
  return (
    <>
      <label className="guide-number-toggle">
        <ProductToggle
          size="sm"
          disabled={disabled}
          aria-label={t('scenario.editor.tourEnabled')}
          checked={tour.endScreen.enabled}
          onClick={() => {
            if (tour.endScreen.enabled && linked) setConfirm(true);
            else
              onChange({
                ...tour,
                endScreen: { ...tour.endScreen, enabled: !tour.endScreen.enabled },
              });
          }}
        />
        {t('scenario.editor.tourEnabled')}
      </label>
      {confirm && (
        <div role="alert" className="tour-review-notice">
          <p>{t('scenario.editor.tourDisableEndLinks')}</p>
          <ProductActionButton compact tone="secondary" onClick={() => setConfirm(false)}>
            {t('common.actions.cancel')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={disabled}
            onClick={() => {
              if (disable()) setConfirm(false);
            }}
          >
            {t('scenario.editor.tourDisableEndConfirm')}
          </ProductActionButton>
        </div>
      )}
    </>
  );
}
