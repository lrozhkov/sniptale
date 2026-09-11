import { useState } from 'react';
import { useEffectPresetCatalog } from './preset-catalog';
import {
  applyEffectV1ControlPresetValues,
  validateEffectV1ControlPresetValues,
  resolveEffectLocaleText,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  collectEffectVisualValues,
  type EffectPresetPreferences,
} from '../../../../../features/video/project/effect-bundle/catalog/presets';
import { getCurrentLocale, translate } from '../../../../../platform/i18n';
import { SelectInput } from '../shared/controls';
import { InspectorActionButton } from '../shared/actions';

export function EffectVisualPresets(props: {
  document: EffectV1Document;
  sourceSha256: string;
  catalogPackId?: string | undefined;
  controls: Readonly<Record<string, number | string>>;
  disabled: boolean;
  onChange(controls: Record<string, number | string>): void;
}) {
  const {
    catalog,
    preferences,
    busy,
    error,
    save: persist,
  } = useEffectPresetCatalog(props.document.id, props.sourceSha256, props.catalogPackId);
  const [preferred, setPreferred] = useState<string | null>(null);
  const options = resolveVisualPresetOptions(props.document, preferences);
  const selected = resolveSelectedPreset(options, props.controls, preferred);
  const defaultValue = preferences.defaultPreset
    ? `${preferences.defaultPreset.kind}:${preferences.defaultPreset.id}`
    : 'template';
  const defaultUnavailable =
    defaultValue !== 'template' &&
    !options.some((option) => option.value === defaultValue && !option.disabled);
  const save = async (next: EffectPresetPreferences) => {
    if (!(await persist(next))) return false;
    const added = next.presets.find(
      (item) => !preferences.presets.some((before) => before.id === item.id)
    );
    if (added) setPreferred(`user:${added.id}`);
    return true;
  };
  const values = collectEffectVisualValues(props.document, props.controls);
  if (!Object.keys(values).length && !options.length) return null;
  return (
    <div className="space-y-2" data-ui="video-editor.effect-presets">
      <SelectInput
        label={translate('videoEditor.effectsLibrary.visualPreset')}
        value={selected}
        disabled={props.disabled || busy}
        options={[
          {
            value: 'custom',
            label: translate('videoEditor.effectsLibrary.customPreset'),
            disabled: true,
          },
          ...options,
        ]}
        onChange={(id) => {
          const preset = options.find((option) => option.value === id);
          setPreferred(id);
          if (preset && !preset.disabled)
            props.onChange(
              applyEffectV1ControlPresetValues(props.document, props.controls, preset.values)
            );
        }}
      />
      {catalog && (
        <SelectInput
          label={translate('videoEditor.effectsLibrary.defaultPreset')}
          value={
            preferences.defaultPreset
              ? `${preferences.defaultPreset.kind}:${preferences.defaultPreset.id}`
              : 'template'
          }
          disabled={busy}
          options={[
            { value: 'template', label: translate('videoEditor.effectsLibrary.templateDefault') },
            ...(defaultUnavailable && !options.some((option) => option.value === defaultValue)
              ? [
                  {
                    value: defaultValue,
                    label: translate('videoEditor.effectsLibrary.presetUnavailable'),
                    disabled: true,
                  },
                ]
              : []),
            ...options,
          ]}
          onChange={(value) => {
            const [kind, id] = value.split(':');
            if ((kind === 'builtin' || kind === 'user') && id)
              void save({ ...preferences, defaultPreset: { kind, id } });
            else void save({ presets: preferences.presets });
          }}
        />
      )}
      {defaultUnavailable && (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.effectsLibrary.presetUnavailable')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('videoEditor.effectsLibrary.updateFailed')}
        </p>
      )}
      <PresetLibraryActions
        preferences={preferences}
        values={values}
        selected={selected}
        available={Boolean(catalog)}
        busy={busy}
        onSave={save}
      />
    </div>
  );
}

function PresetLibraryActions({
  preferences,
  values,
  selected,
  available,
  busy,
  onSave,
}: {
  preferences: EffectPresetPreferences;
  values: Record<string, number | string>;
  selected: string;
  available: boolean;
  busy: boolean;
  onSave(next: EffectPresetPreferences): Promise<boolean>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = async (next: EffectPresetPreferences) => {
    if (await onSave(next)) {
      setNaming(false);
      setName('');
    }
  };
  return (
    <>
      {' '}
      {naming ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void save({
              ...preferences,
              presets: [
                ...preferences.presets,
                { id: crypto.randomUUID(), name: name.trim(), values },
              ],
            });
          }}
        >
          <input
            autoFocus
            maxLength={120}
            value={name}
            aria-label={translate('videoEditor.effectsLibrary.presetName')}
            onChange={(event) => setName(event.target.value)}
            className={[
              'min-w-0 flex-1 rounded-[4px] border bg-transparent px-2 text-sm',
              'border-[var(--sniptale-color-border-soft)]',
            ].join(' ')}
          />
          <InspectorActionButton disabled={busy || !name.trim()} type="submit">
            {translate('common.actions.save')}
          </InspectorActionButton>
          <InspectorActionButton type="button" disabled={busy} onClick={() => setNaming(false)}>
            {translate('common.actions.cancel')}
          </InspectorActionButton>
        </form>
      ) : (
        <div className="flex justify-end gap-2 border-t border-[var(--sniptale-color-border-soft)] pt-2">
          <InspectorActionButton
            disabled={
              !available || busy || !Object.keys(values).length || preferences.presets.length >= 16
            }
            onClick={() => setNaming(true)}
          >
            {translate('videoEditor.effectsLibrary.savePreset')}
          </InspectorActionButton>
          {selected.startsWith('user:') && (
            <InspectorActionButton
              disabled={busy}
              onClick={() => {
                const id = selected.slice(5);
                const next = {
                  ...preferences,
                  presets: preferences.presets.filter((preset) => preset.id !== id),
                };
                if (next.defaultPreset?.kind === 'user' && next.defaultPreset.id === id)
                  delete next.defaultPreset;
                void save(next);
              }}
            >
              {translate('common.actions.delete')}
            </InspectorActionButton>
          )}
        </div>
      )}
    </>
  );
}

function resolveVisualPresetOptions(
  document: EffectV1Document,
  preferences: EffectPresetPreferences
) {
  const options = [
    ...(document.controlPresets ?? []).map((preset) => ({
      value: `builtin:${preset.id}`,
      label: resolveEffectLocaleText(preset.label, getCurrentLocale()),
      values: preset.values,
      disabled: false,
    })),
    ...preferences.presets.map((preset) => ({
      value: `user:${preset.id}`,
      label: validateEffectV1ControlPresetValues(document, preset.values).ok
        ? preset.name
        : `${preset.name} — ${translate('videoEditor.effectsLibrary.presetUnavailable')}`,
      values: preset.values,
      disabled: !validateEffectV1ControlPresetValues(document, preset.values).ok,
    })),
  ];
  return options;
}
function resolveSelectedPreset(
  options: ReturnType<typeof resolveVisualPresetOptions>,
  controls: Readonly<Record<string, number | string>>,
  preferred: string | null
) {
  const matches = (option: (typeof options)[number]) =>
    !option.disabled &&
    Object.entries(option.values).every(([id, value]) => controls[id] === value);
  return (
    options.find((option) => option.value === preferred && matches(option))?.value ??
    options.find(matches)?.value ??
    'custom'
  );
}
