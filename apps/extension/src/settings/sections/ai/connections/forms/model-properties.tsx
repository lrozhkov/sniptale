import { ProductField, ProductInput, ProductSelect } from '@sniptale/ui/product-form-controls';
import type { AIModelCapabilities, AISupport } from '../../../../../contracts/settings/ai-catalog';
import {
  formatNumber,
  getCurrentLocale,
  translate,
  type TranslationKey,
} from '../../../../../platform/i18n';

const operations = [
  ['text', 'settings.aiProviders.modelOperationText'],
  ['transcription', 'settings.aiProviders.modelOperationTranscription'],
  ['speech', 'settings.aiProviders.modelOperationSpeech'],
  ['image-generation', 'settings.aiProviders.modelOperationImageGeneration'],
  ['image-editing', 'settings.aiProviders.modelOperationImageEditing'],
  ['background-removal', 'settings.aiProviders.modelOperationBackgroundRemoval'],
] as const;
const modalities = [
  ['text', 'settings.aiProviders.modelModalityText'],
  ['image', 'settings.aiProviders.modelModalityImage'],
  ['audio', 'settings.aiProviders.modelModalityAudio'],
  ['video', 'settings.aiProviders.modelModalityVideo'],
  ['file', 'settings.aiProviders.modelModalityFile'],
] as const;
const features = [
  ['structured-output', 'settings.aiProviders.modelFeatureStructured'],
  ['tools', 'settings.aiProviders.modelFeatureTools'],
  ['streaming', 'settings.aiProviders.modelFeatureStreaming'],
  ['mask', 'settings.aiProviders.modelFeatureMask'],
  ['word-timestamps', 'settings.aiProviders.modelFeatureWords'],
  ['segment-timestamps', 'settings.aiProviders.modelFeatureSegments'],
] as const;
const supportLabels = {
  supported: 'settings.aiProviders.modelSupportYes',
  unsupported: 'settings.aiProviders.modelSupportNo',
  unknown: 'settings.aiProviders.modelSupportUnknown',
} as const;
const disclosureClass = 'text-[13px] leading-[18px]';
const summaryClass = 'min-h-8 cursor-pointer py-2 text-[var(--sniptale-color-text-muted)]';

function CapabilityGroup<TKey extends string>(props: {
  title: TranslationKey;
  entries: ReadonlyArray<readonly [TKey, TranslationKey]>;
  values: Partial<Record<TKey, AISupport>>;
  onChange?: ((values: Partial<Record<TKey, AISupport>>) => void) | undefined;
}) {
  return (
    <details className={disclosureClass}>
      <summary className={summaryClass}>{translate(props.title)}</summary>
      {props.onChange ? (
        <div className="space-y-1 pb-2">
          {props.entries.map(([key, label]) => (
            <div
              key={key}
              className="grid min-h-8 grid-cols-[minmax(0,1fr)_160px] items-center gap-2"
            >
              <span className="text-[var(--sniptale-color-text-muted)]">{translate(label)}</span>
              <ProductSelect
                aria-label={`${translate(props.title)}: ${translate(label)}`}
                value={props.values[key] ?? 'unknown'}
                options={Object.entries(supportLabels).map(([value, name]) => ({
                  value,
                  label: translate(name),
                }))}
                onChange={(value) => {
                  if (value === 'supported' || value === 'unsupported' || value === 'unknown')
                    props.onChange?.({ ...props.values, [key]: value });
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <dl className="space-y-1 pb-2">
          {props.entries.map(([key, label]) => (
            <div key={key} className="grid min-h-7 grid-cols-2 items-start gap-2">
              <dt className="text-[var(--sniptale-color-text-muted)]">{translate(label)}</dt>
              <dd className="m-0 text-right">
                {translate(supportLabels[props.values[key] ?? 'unknown'])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}

export function ModelProperties(props: {
  capabilities: AIModelCapabilities;
  onChange?: ((capabilities: AIModelCapabilities) => void) | undefined;
}) {
  const change = props.onChange;
  return (
    <section aria-label={translate('settings.aiProviders.modelCapabilitiesTitle')}>
      <CapabilityGroup
        title="settings.aiProviders.modelOperationsTitle"
        entries={operations}
        values={props.capabilities.operations}
        onChange={
          change ? (values) => change({ ...props.capabilities, operations: values }) : undefined
        }
      />
      <CapabilityGroup
        title="settings.aiProviders.modelInputTitle"
        entries={modalities}
        values={props.capabilities.input}
        onChange={change ? (values) => change({ ...props.capabilities, input: values }) : undefined}
      />
      <CapabilityGroup
        title="settings.aiProviders.modelOutputTitle"
        entries={modalities}
        values={props.capabilities.output}
        onChange={
          change ? (values) => change({ ...props.capabilities, output: values }) : undefined
        }
      />
      <CapabilityGroup
        title="settings.aiProviders.modelFeaturesTitle"
        entries={features}
        values={props.capabilities.features}
        onChange={
          change ? (values) => change({ ...props.capabilities, features: values }) : undefined
        }
      />
      <details className={disclosureClass}>
        <summary className={summaryClass}>
          {translate('settings.aiProviders.modelLimitsTitle')}
        </summary>
        {(['contextWindow', 'maxOutputTokens'] as const).map((key) => {
          const label = translate(
            key === 'contextWindow'
              ? 'settings.aiProviders.modelContextWindow'
              : 'settings.aiProviders.modelMaxOutputTokens'
          );
          const value = props.capabilities[key];
          return change ? (
            <ProductField key={key} label={label}>
              <ProductInput
                type="number"
                min={0}
                step={1}
                aria-label={label}
                placeholder={translate('settings.aiProviders.modelSupportUnknown')}
                value={value ?? ''}
                onChange={(event) => {
                  const { [key]: _previous, ...rest } = props.capabilities;
                  const number = event.target.valueAsNumber;
                  if (event.target.value === '') change(rest);
                  else if (Number.isFinite(number) && number >= 0)
                    change({ ...rest, [key]: number });
                }}
              />
            </ProductField>
          ) : (
            <dl key={key}>
              <div className="grid min-h-7 grid-cols-2 gap-2">
                <dt className="text-[var(--sniptale-color-text-muted)]">{label}</dt>
                <dd className="m-0 text-right tabular-nums">
                  {value === undefined
                    ? translate('settings.aiProviders.modelSupportUnknown')
                    : formatNumber(value, undefined, getCurrentLocale())}
                </dd>
              </div>
            </dl>
          );
        })}
      </details>
    </section>
  );
}
