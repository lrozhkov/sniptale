/** Immutable identity of bundled processing code and its embedded model. */
export interface AudioProcessorIdentity {
  engine: 'faust' | 'rnnoise' | 'signalsmith';
  version: string;
  sha256: string;
}

interface FaustSettings {
  processor: AudioProcessorIdentity & { engine: 'faust' };
  enabled: boolean;
  wet: number;
}

/** Closed wire operations. Display names and bundled implementations belong to the app. */
export type AudioEffectSettings = FaustSettings &
  (
    | { kind: 'eq'; parameters: { frequency: number; gain: number; q: number } }
    | { kind: 'highpass' | 'lowpass'; parameters: { frequency: number } }
    | {
        kind: 'compressor';
        parameters: { threshold: number; ratio: number; attack: number; release: number };
      }
    | { kind: 'limiter'; parameters: { ceiling: number; release: number } }
    | { kind: 'delay'; parameters: { duration: number; feedback: number } }
    | { kind: 'reverb'; parameters: { feedback: number; damping: number } }
    | { kind: 'saturation'; parameters: { drive: number } }
  );

/** A placement owns each instance. Duplicating a placement creates new instance identities. */
export type AudioEffectInstance = AudioEffectSettings & { id: string };

interface AudioProcessingBase {
  version: 1;
  bypassed: boolean;
  denoise?:
    | { enabled: boolean; processor: AudioProcessorIdentity & { engine: 'rnnoise' } }
    | undefined;
  pitch?:
    | {
        enabled: boolean;
        semitones: number;
        processor: AudioProcessorIdentity & { engine: 'signalsmith' };
      }
    | undefined;
}

/** Accepted project values contain no runtime handles or references to a user preset. */
export interface AudioProcessing extends AudioProcessingBase {
  effects: AudioEffectInstance[];
}

/** A portable preset omits all instance identities and source bindings. */
export interface AudioProcessingPreset {
  format: 'sniptale-audio-preset';
  version: 1;
  name: string;
  processing: AudioProcessingBase & { effects: AudioEffectSettings[] };
}

export const AUDIO_PROCESSING_MAX_EFFECTS = 8;
export const AUDIO_PRESET_MAX_BYTES = 16 * 1024;
