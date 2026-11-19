import { useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import {
  AUDIO_PROCESSING_MAX_EFFECTS,
  parseAudioProcessing,
  type AudioProcessing,
  type AudioEffectInstance,
  type AudioEffectSettings,
} from '@sniptale/runtime-contracts/audio-effects';
import {
  AUDIO_DSP_ASSETS,
  createAudioEffectInstance,
  getAudioEffectDefinition,
  unavailableAudioProcessor,
} from '../../features/video/audio/effects/catalog';
import { translate, useAppLocale, type TranslationKey } from '../../platform/i18n';
import { ToggleField, SelectField } from '../compact-inspector-controls';
import { DraftNumericRow } from '../compact-inspector-controls/numeric-preview';
import { InspectorDisclosureView } from '../compact-inspector-controls/disclosure';
import type { CompactInspectorUnit } from '../compact-inspector-controls/shared';

const effectKinds = [
  'eq',
  'highpass',
  'lowpass',
  'compressor',
  'limiter',
  'delay',
  'reverb',
  'saturation',
] as const;
const names: Record<AudioEffectSettings['kind'], TranslationKey> = {
  eq: 'audioProcessing.effects.eq',
  highpass: 'audioProcessing.effects.highpass',
  lowpass: 'audioProcessing.effects.lowpass',
  compressor: 'audioProcessing.effects.compressor',
  limiter: 'audioProcessing.effects.limiter',
  delay: 'audioProcessing.effects.delay',
  reverb: 'audioProcessing.effects.reverb',
  saturation: 'audioProcessing.effects.saturation',
};
const parameters: Record<string, { labelKey: TranslationKey; unit: CompactInspectorUnit }> = {
  frequency: { labelKey: 'audioProcessing.controls.frequency', unit: 'hz' },
  gain: { labelKey: 'audioProcessing.controls.gain', unit: 'db' },
  q: { labelKey: 'audioProcessing.controls.q', unit: '' },
  attack: { labelKey: 'audioProcessing.controls.attack', unit: 'ms' },
  release: { labelKey: 'audioProcessing.controls.release', unit: 'ms' },
  threshold: { labelKey: 'audioProcessing.controls.threshold', unit: 'db' },
  ratio: { labelKey: 'audioProcessing.controls.ratio', unit: 'ratio' },
  ceiling: { labelKey: 'audioProcessing.controls.ceiling', unit: 'db' },
  duration: { labelKey: 'audioProcessing.controls.duration', unit: 'ms' },
  feedback: { labelKey: 'audioProcessing.controls.feedback', unit: '%' },
  damping: { labelKey: 'audioProcessing.controls.damping', unit: '%' },
  drive: { labelKey: 'audioProcessing.controls.drive', unit: '%' },
};

/** Shared controlled presentation. Runtime adapters retain selection, commands, history and DSP preparation. */
export function AudioProcessingFields(props: {
  value: AudioProcessing | undefined;
  disabled?: boolean;
  mixed?: boolean;
  sourceScope?: boolean;
  createDefaultProcessing?: (() => AudioProcessing | null | undefined) | undefined;
  onChange(value: AudioProcessing | undefined): void;
}) {
  useAppLocale();
  const [invalid, setInvalid] = useState(false);
  const value: AudioProcessing = props.value ?? { version: 1, bypassed: false, effects: [] };
  const commit = (next: unknown) => {
    if (props.disabled) return;
    const accepted = parseAudioProcessing(next);
    if (!accepted) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    props.onChange(accepted);
  };
  const patchEffect = (id: string, patch: Partial<AudioEffectInstance>) =>
    commit({
      ...value,
      ...(patch.enabled ? { bypassed: false } : {}),
      effects: value.effects.map((effect) => (effect.id === id ? { ...effect, ...patch } : effect)),
    });
  const move = (index: number, delta: number) => {
    const effects = [...value.effects],
      target = index + delta;
    if (target < 0 || target >= effects.length) return;
    [effects[index], effects[target]] = [effects[target]!, effects[index]!];
    commit({ ...value, effects });
  };
  return (
    <div className="sniptale-parameter-stack min-w-0" data-ui="audio.processing-fields">
      <ToggleField
        label={translate('audioProcessing.title')}
        value={!!props.value && !value.bypassed}
        disabled={props.disabled ?? false}
        onChange={(enabled) => {
          const cleared =
            !props.value ||
            (value.bypassed && value.effects.length === 0 && !value.denoise && !value.pitch);
          if (enabled && cleared && props.createDefaultProcessing) {
            const initial = props.createDefaultProcessing();
            if (initial === null) {
              setInvalid(true);
              return;
            }
            commit(initial ?? { ...value, bypassed: false });
          } else commit({ ...value, bypassed: !enabled });
        }}
      />
      {props.mixed || props.sourceScope ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate(props.mixed ? 'audioProcessing.mixed' : 'audioProcessing.sourceScope')}
        </p>
      ) : null}
      {unavailableAudioProcessor(value) ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('audioProcessing.unavailable')}
        </p>
      ) : null}
      {invalid ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate('audioProcessing.invalid')}
        </p>
      ) : null}
      <ToggleField
        label={translate('audioProcessing.denoise')}
        value={value.denoise?.enabled ?? false}
        disabled={props.disabled ?? false}
        onChange={(enabled) =>
          commit({
            ...value,
            ...(enabled ? { bypassed: false } : {}),
            denoise: {
              processor: { ...AUDIO_DSP_ASSETS.denoise.processor },
              ...value.denoise,
              enabled,
            },
          })
        }
      />
      <ToggleField
        label={translate('audioProcessing.pitchEnabled')}
        value={value.pitch?.enabled ?? false}
        disabled={props.disabled ?? false}
        onChange={(enabled) =>
          commit({
            ...value,
            ...(enabled ? { bypassed: false } : {}),
            pitch: {
              processor: { ...AUDIO_DSP_ASSETS.pitch.processor },
              semitones: 0,
              ...value.pitch,
              enabled,
            },
          })
        }
      />
      {value.pitch?.enabled ? (
        <DraftNumericRow
          label={translate('audioProcessing.pitch')}
          unit="semitones"
          min={-12}
          max={12}
          step={0.1}
          precision={1}
          value={value.pitch.semitones}
          disabled={props.disabled ?? false}
          onChange={(semitones) => commit({ ...value, pitch: { ...value.pitch, semitones } })}
        />
      ) : null}
      {value.effects.map((effect, index) => (
        <AudioEffectFields
          key={effect.id}
          effect={effect}
          disabled={props.disabled ?? false}
          first={index === 0}
          last={index === value.effects.length - 1}
          onChange={(patch) => patchEffect(effect.id, patch)}
          onParameterChange={(key, next) =>
            commit({
              ...value,
              effects: value.effects.map((item) =>
                item.id === effect.id
                  ? { ...item, parameters: { ...item.parameters, [key]: next } }
                  : item
              ),
            })
          }
          onMove={(delta) => move(index, delta)}
          onRemove={() =>
            commit({ ...value, effects: value.effects.filter((item) => item.id !== effect.id) })
          }
        />
      ))}
      <SelectField<AudioEffectSettings['kind']>
        label={translate('audioProcessing.addEffect')}
        placeholder={translate('audioProcessing.chooseEffect')}
        value=""
        options={effectKinds.map((kind) => ({ value: kind, label: translate(names[kind]) }))}
        disabled={props.disabled || value.effects.length >= AUDIO_PROCESSING_MAX_EFFECTS}
        onChange={(kind) =>
          commit({
            ...value,
            bypassed: false,
            effects: [...value.effects, createAudioEffectInstance(kind, crypto.randomUUID())],
          })
        }
      />
      {props.value && (!value.bypassed || value.effects.length || value.denoise || value.pitch) ? (
        <div className="flex min-w-0 justify-end">
          <EditorIconButton
            title={translate('audioProcessing.resetAll')}
            variant="utility"
            disabled={props.disabled ?? false}
            onClick={() => {
              if (!props.disabled) {
                setInvalid(false);
                props.onChange(undefined);
              }
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </EditorIconButton>
        </div>
      ) : null}
    </div>
  );
}
function AudioEffectFields(props: {
  effect: AudioEffectInstance;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onChange(patch: Partial<AudioEffectInstance>): void;
  onParameterChange(key: string, value: number): void;
  onMove(delta: number): void;
  onRemove(): void;
}) {
  const [open, setOpen] = useState(true),
    effect = props.effect;
  const definition = getAudioEffectDefinition(effect.kind);
  return (
    <section
      className="min-w-0 border-t border-[var(--sniptale-color-border-subtle)] pt-2"
      data-audio-effect={effect.id}
    >
      <ToggleField
        label={translate(names[effect.kind])}
        value={effect.enabled}
        disabled={props.disabled ?? false}
        onChange={(enabled) => props.onChange({ enabled })}
      />
      <div className="flex min-w-0 justify-end gap-1">
        <EditorIconButton
          title={translate('audioProcessing.moveUp')}
          variant="utility"
          disabled={props.disabled || props.first}
          onClick={() => props.onMove(-1)}
        >
          <ArrowUp size={16} aria-hidden="true" />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.moveDown')}
          variant="utility"
          disabled={props.disabled || props.last}
          onClick={() => props.onMove(1)}
        >
          <ArrowDown size={16} aria-hidden="true" />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.reset')}
          variant="utility"
          disabled={props.disabled ?? false}
          onClick={() => props.onChange(createAudioEffectInstance(effect.kind, effect.id))}
        >
          <RotateCcw size={16} aria-hidden="true" />
        </EditorIconButton>
        <EditorIconButton
          title={translate('audioProcessing.remove')}
          variant="utility"
          danger
          disabled={props.disabled ?? false}
          onClick={props.onRemove}
        >
          <Trash2 size={16} aria-hidden="true" />
        </EditorIconButton>
      </div>
      <InspectorDisclosureView
        variant="structural"
        label={translate('audioProcessing.parameters')}
        dataUi="audio.effect-parameters"
        bodyClassName="sniptale-parameter-stack min-w-0"
        open={open}
        onOpenChange={setOpen}
      >
        <DraftNumericRow
          label={translate('audioProcessing.wet')}
          rangePresentation="field"
          value={effect.wet * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          disabled={props.disabled ?? false}
          onChange={(wet) => props.onChange({ wet: wet / 100 })}
        />
        {definition.parameters.map((parameter) => {
          const presentation = parameters[parameter.key];
          if (!presentation) throw new Error('Fixed audio parameter presentation is unavailable.');
          const raw = Object.entries(effect.parameters).find(([key]) => key === parameter.key)?.[1];
          if (raw === undefined) throw new Error('Fixed audio parameter value is unavailable.');
          const scale = presentation.unit === '%' ? 100 : presentation.unit === 'ms' ? 1000 : 1;
          return (
            <DraftNumericRow
              key={parameter.key}
              scrubEnabled={parameter.key === 'gain'}
              label={translate(presentation.labelKey)}
              unit={presentation.unit}
              value={raw * scale}
              min={parameter.min * scale}
              max={parameter.max * scale}
              step={parameter.step * scale}
              precision={scale > 1 ? 0 : parameter.step < 0.01 ? 3 : parameter.step < 1 ? 2 : 0}
              disabled={props.disabled ?? false}
              onChange={(next) => props.onParameterChange(parameter.key, next / scale)}
            />
          );
        })}
      </InspectorDisclosureView>
    </section>
  );
}
