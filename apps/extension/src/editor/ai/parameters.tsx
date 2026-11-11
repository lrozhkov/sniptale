import { SlidersHorizontal } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { translate, type TranslationKey } from '../../platform/i18n';
import type { ImageModelProfile } from '../../contracts/ai/image-profile';
import type { ImageParameters } from '../../contracts/ai/image';
import { CompactInput, SelectField } from '../chrome/ui';

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
    if (current === undefined) continue;
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
  onChange(value: ImageParameters): void;
}) {
  const p = props.profile,
    value = props.value;
  const fields = p ? getChoiceFields(p).filter((field) => field.choices.length > 0) : [];
  const resolution = p ? resolveImageParameterChoices(p, value) : null;
  return (
    <div className="space-y-1">
      {resolution?.incompatible.length ? (
        <div className="space-y-1 py-1 text-xs" role="status">
          <p>{translate('editor.ai.incompatibleParameters')}</p>
          <p className="break-words text-[var(--sniptale-color-text-secondary)]">
            {resolution.incompatible.join(' · ')}
          </p>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={props.disabled}
            onClick={() => props.onChange(resolution.parameters)}
          >
            {translate('editor.ai.adaptParameters')}
          </ProductActionButton>
        </div>
      ) : null}
      <SelectField
        label={translate('editor.ai.variants')}
        value={String(value.variants)}
        options={['1', '2', '3'].map((choice) => ({ value: choice, label: choice }))}
        disabled={props.disabled}
        onChange={(choice) => props.onChange({ ...value, variants: Number(choice) })}
      />
      {p ? (
        <details className="text-xs">
          <summary className="flex cursor-pointer items-center gap-2 py-2 text-[var(--sniptale-color-text-secondary)]">
            <SlidersHorizontal size={14} />
            {translate('editor.ai.parameters')}
            <span className="ml-auto tabular-nums">
              {[value.resolution, value.aspectRatio, value.outputFormat?.toUpperCase()]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </summary>
          <div className="space-y-1">
            {fields.map((field) => (
              <SelectField
                key={field.key}
                label={translate(field.label)}
                value={value[field.key] ?? ''}
                options={field.choices.map((choice) => ({
                  value: choice,
                  label: getChoiceLabel(field.key, choice),
                }))}
                disabled={props.disabled}
                onChange={(choice) => props.onChange({ ...value, [field.key]: choice })}
              />
            ))}
            {p.seed ? (
              <label className="flex items-center justify-between gap-2 py-1">
                <span>{translate('editor.ai.seed')}</span>
                <CompactInput
                  className="w-28"
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
              </label>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
