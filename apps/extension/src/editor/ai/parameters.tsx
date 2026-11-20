import { InspectorParameterRow } from '../../ui/compact-inspector-controls/layout';
import { SlidersHorizontal } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { INSPECTOR_SECONDARY_BUTTON_CLASS_NAME } from '../inspector/chrome';
import { translate, type TranslationKey } from '../../platform/i18n';
import type { ImageModelProfile } from '../../contracts/ai/image-profile';
import type { ImageParameters } from '../../contracts/ai/image';
import { TextField, CompactSelect } from '../chrome/ui';

type ChoiceKey = Exclude<keyof ImageParameters, 'variants' | 'seed'>;
type ChoiceField = {
  [K in ChoiceKey]: {
    key: K;
    label: TranslationKey;
    choices: readonly NonNullable<ImageParameters[K]>[];
  };
}[ChoiceKey];

function getChoiceFields(profile: ImageModelProfile): ChoiceField[] {
  return [
    { key: 'aspectRatio', label: 'editor.ai.ratio', choices: profile.aspectRatios },
    { key: 'resolution', label: 'editor.ai.resolution', choices: profile.resolutions },
    { key: 'size', label: 'editor.ai.size', choices: profile.sizes },
    { key: 'quality', label: 'editor.ai.quality', choices: profile.qualities },
    { key: 'outputFormat', label: 'editor.ai.format', choices: profile.formats },
    { key: 'background', label: 'editor.ai.background', choices: profile.backgrounds },
  ];
}

/** Retains compatible choices and proposes replacements without changing the draft. */
export function resolveImageParameterChoices(profile: ImageModelProfile, value: ImageParameters) {
  let parameters = { ...profile.defaults, variants: value.variants };
  const incompatible: string[] = [];
  for (const field of getChoiceFields(profile)) {
    const current = value[field.key];
    if (current === undefined) {
      if (Object.hasOwn(value, field.key)) parameters = { ...parameters, [field.key]: undefined };
      continue;
    }
    if (field.choices.some((choice) => choice === current))
      parameters = { ...parameters, [field.key]: current };
    else incompatible.push(current);
  }
  if (value.seed !== undefined) {
    if (profile.seed) parameters.seed = value.seed;
    else incompatible.push(String(value.seed));
  }
  if (value.background === 'transparent' && value.outputFormat === 'jpeg') {
    incompatible.push('transparent / jpeg');
    parameters.outputFormat = profile.formats.includes('png') ? 'png' : undefined;
  }
  return { parameters, incompatible };
}

const choiceLabels: Readonly<Record<string, TranslationKey>> = {
  low: 'editor.ai.low',
  medium: 'editor.ai.medium',
  high: 'editor.ai.high',
  standard: 'editor.ai.standard',
  hd: 'editor.ai.hd',
  opaque: 'editor.ai.opaque',
  transparent: 'editor.ai.transparent',
};
function getChoiceLabel(key: ChoiceKey, value: string): string {
  if (key === 'size') return value.replace('x', ' × ');
  if (key === 'outputFormat') return value.toUpperCase();
  const label = choiceLabels[value];
  return label ? translate(label) : value;
}

/** Renders only parameters admitted by the current protocol profile. */
export function ImageParametersEditor(props: {
  profile: ImageModelProfile | null;
  value: ImageParameters;
  disabled: boolean;
  automaticGeometry?: boolean;
  onChange(value: ImageParameters): void;
}) {
  const p = props.profile,
    value = props.value;
  const fields = p
    ? getChoiceFields(p).filter(
        (field) =>
          field.choices.length > 0 &&
          (!props.automaticGeometry || (field.key !== 'aspectRatio' && field.key !== 'size'))
      )
    : [];
  const resolution = p ? resolveImageParameterChoices(p, value) : null;
  return (
    <div className="min-w-0 space-y-1">
      {resolution?.incompatible.length ? (
        <div className="space-y-1 py-1 text-xs" role="status">
          <p>{translate('editor.ai.incompatibleParameters')}</p>
          <p className="break-words text-[var(--sniptale-color-text-secondary)]">
            {resolution.incompatible.join(' · ')}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            className={INSPECTOR_SECONDARY_BUTTON_CLASS_NAME}
            disabled={props.disabled}
            onClick={() => props.onChange(resolution.parameters)}
          >
            {translate('editor.ai.adaptParameters')}
          </ProductActionButton>
        </div>
      ) : null}
      {p ? (
        <details className="min-w-0 text-xs">
          <summary
            data-ui="editor.ai.parameters-summary"
            className="flex min-w-0 cursor-pointer items-center gap-2 py-2 text-[var(--sniptale-color-text-secondary)]"
          >
            <SlidersHorizontal size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">{translate('editor.ai.parameters')}</span>
            <span className="ml-auto min-w-0 max-w-[55%] break-words text-right tabular-nums">
              {[
                props.automaticGeometry
                  ? `${translate('editor.ai.autoRatio')} ${value.aspectRatio ?? ''}`
                  : value.aspectRatio,
                value.resolution,
                value.outputFormat?.toUpperCase(),
              ]
                .filter(Boolean)
                .join(' · ') || translate('editor.ai.providerDefault')}
            </span>
          </summary>
          <div className="min-w-0 space-y-1">
            {fields.map((field) => (
              <InspectorParameterRow
                key={field.key}
                label={translate(field.label)}
                dataUi={`editor.ai.parameter.${field.key}`}
              >
                <CompactSelect
                  aria-label={translate(field.label)}
                  appearance="plain"
                  value={value[field.key] ?? ''}
                  options={[
                    { value: '', label: translate('editor.ai.providerDefault') },
                    ...field.choices.map((choice) => ({
                      value: choice,
                      label: getChoiceLabel(field.key, choice),
                    })),
                  ]}
                  disabled={props.disabled}
                  onChange={(choice) =>
                    props.onChange({ ...value, [field.key]: choice || undefined })
                  }
                />
              </InspectorParameterRow>
            ))}
            {p.seed ? (
              <TextField
                label={translate('editor.ai.seed')}
                placeholder={translate('editor.ai.automaticSeed')}
                data-ui="editor.ai.seed"
                type="number"
                min={0}
                max={2147483647}
                disabled={props.disabled}
                value={value.seed ?? ''}
                onChange={(event) => {
                  const seed =
                    event.currentTarget.value === ''
                      ? undefined
                      : Number(event.currentTarget.value);
                  if (
                    seed === undefined ||
                    (Number.isInteger(seed) && seed >= 0 && seed <= 2147483647)
                  )
                    props.onChange({ ...value, seed });
                }}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
