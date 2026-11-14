import {
  parseAudioProcessing,
  parseAudioProcessingPreset,
  parseAudioProcessingPresetJson,
  type AudioProcessing,
  type AudioProcessingPreset,
} from '@sniptale/runtime-contracts/audio-effects';
import { createAudioEffectInstance, unavailableAudioProcessor } from './catalog';

function allocateInstances(
  value: AudioProcessingPreset['processing'],
  forbidden: Set<string>,
  createId: () => string
): AudioProcessing {
  const effects = value.effects.map((effect) => {
    let id = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = createId();
      if (candidate && !forbidden.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) throw new Error('Could not allocate an independent audio effect identity.');
    forbidden.add(id);
    return { ...effect, id };
  });
  const result = parseAudioProcessing({ ...value, effects });
  if (!result)
    throw new Error('Audio effect identity allocation violated the processing contract.');
  return result;
}

/** Copy accepted authored data, including unavailable implementations, without sharing instance state. */
export function duplicateAudioProcessing(
  value: AudioProcessing,
  createId: () => string = () => crypto.randomUUID()
): AudioProcessing {
  const accepted = parseAudioProcessing(value);
  if (!accepted) throw new Error('Cannot duplicate invalid audio processing.');
  return allocateInstances(
    accepted,
    new Set(accepted.effects.map((effect) => effect.id)),
    createId
  );
}

/** Export only accepted DSP values. Media, placement and instance identities never enter the file. */
export function serializeAudioProcessingPreset(value: unknown, name: string): string | null {
  const accepted = parseAudioProcessing(value);
  if (!accepted) return null;
  const preset = parseAudioProcessingPreset({
    format: 'sniptale-audio-preset',
    version: 1,
    name,
    processing: {
      ...accepted,
      effects: accepted.effects.map(({ id: _id, ...settings }) => settings),
    },
  });
  if (!preset) return null;
  const source = JSON.stringify(preset);
  return parseAudioProcessingPresetJson(source) ? source : null;
}

/** Applying a portable preset requires every referenced implementation, even a bypassed stage. */
export function materializeAudioProcessingPreset(
  value: unknown,
  createId: () => string = () => crypto.randomUUID()
): AudioProcessing | null {
  const accepted = parseAudioProcessingPreset(value);
  if (!accepted) return null;
  let processing: AudioProcessing;
  try {
    processing = allocateInstances(accepted.processing, new Set(), createId);
  } catch {
    return null;
  }
  const required: AudioProcessing = {
    ...processing,
    bypassed: false,
    effects: processing.effects.map((effect) => ({ ...effect, enabled: true, wet: 1 })),
    ...(processing.denoise ? { denoise: { ...processing.denoise, enabled: true } } : {}),
    ...(processing.pitch ? { pitch: { ...processing.pitch, enabled: true } } : {}),
  };
  return unavailableAudioProcessor(required) ? null : processing;
}

/** Fixed examples contain values only; applying one always materializes independent instances. */
export function listBuiltInAudioPresets(): {
  id: 'speech' | 'telephone' | 'echo' | 'room';
  preset: AudioProcessingPreset;
}[] {
  const identity = 'b1b80118-71a9-4e59-89d2-a95ba0139aa1';
  const equalizer = createAudioEffectInstance('eq', identity);
  const compressor = createAudioEffectInstance('compressor', identity);
  const highpass = createAudioEffectInstance('highpass', identity);
  const lowpass = createAudioEffectInstance('lowpass', identity);
  if (
    equalizer.kind !== 'eq' ||
    compressor.kind !== 'compressor' ||
    highpass.kind !== 'highpass' ||
    lowpass.kind !== 'lowpass'
  )
    throw new Error('Fixed audio preset operations differ from the bundled catalog.');
  equalizer.parameters = { frequency: 2400, gain: 2, q: 0.7 };
  compressor.parameters = { threshold: -18, ratio: 3, attack: 0.01, release: 0.15 };
  highpass.parameters.frequency = 300;
  lowpass.parameters.frequency = 3400;
  const definitions = [
    { id: 'speech' as const, name: 'Speech', effects: [equalizer, compressor] },
    { id: 'telephone' as const, name: 'Telephone', effects: [highpass, lowpass] },
    { id: 'echo' as const, name: 'Echo', effects: [createAudioEffectInstance('delay', identity)] },
    { id: 'room' as const, name: 'Room', effects: [createAudioEffectInstance('reverb', identity)] },
  ];
  return definitions.map(({ id, name, effects }) => {
    const preset = parseAudioProcessingPreset({
      format: 'sniptale-audio-preset',
      version: 1,
      name,
      processing: {
        version: 1,
        bypassed: false,
        effects: effects.map(({ id: _id, ...settings }) => settings),
      },
    });
    if (!preset) throw new Error('Fixed audio preset values violate the portable contract.');
    return { id, preset };
  });
}
