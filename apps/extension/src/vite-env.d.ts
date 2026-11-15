/// <reference types="vite/client" />
/// <reference types="./platform/i18n/catalog-projections" />

declare const __ENABLE_DESIGN_SYSTEM__: boolean;
declare const __SNIPTALE_SECURITY_E2E__: boolean;
declare const __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__: string | undefined;
declare const __SNIPTALE_TRACE_WS_URL__: unknown;
declare const __TRACE_MESSAGES__: boolean | undefined;

declare module '*?tour-player-script' {
  const source: string;
  export default source;
}

/** Fixed local runtime exports. The generator verifies their pinned source bytes. */
declare module 'sniptale:audio-runtime/faust' {
  export const FaustWasmInstantiator: {
    createSyncMonoDSPInstance(factory: { module: WebAssembly.Module; json: string }): unknown;
  };
  export class FaustMonoWebAudioDsp {
    constructor(
      instance: unknown,
      sampleRate: number,
      sampleSize: number,
      quantum: number,
      soundfiles: Record<string, never>
    );
    compute(input: Float32Array[], output: Float32Array[]): boolean;
    start(): void;
    instanceClear(): void;
    setParamValue(address: string, value: number): void;
    destroy(): void;
  }
}

declare module 'sniptale:audio-runtime/rnnoise' {
  interface RnnoiseModule {
    ready: Promise<RnnoiseModule>;
    HEAPF32: Float32Array;
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _rnnoise_create(model: number): number;
    _rnnoise_init(state: number, model: number): number;
    _rnnoise_destroy(state: number): void;
    _rnnoise_process_frame(state: number, output: number, input: number): number;
  }
  export default function createRnnoise(options: {
    instantiateWasm(
      imports: WebAssembly.Imports,
      receiveInstance: (instance: WebAssembly.Instance) => void
    ): WebAssembly.Exports;
  }): RnnoiseModule;
}

declare module 'sniptale:audio-runtime/pitch' {
  interface PitchModule {
    HEAP8: Int8Array;
    _main(): number;
    _presetDefault(channels: number, sampleRate: number): void;
    _setTransposeSemitones(semitones: number, tonalityLimit: number): void;
    _setBuffers(channels: number, frames: number): number;
    _inputLatency(): number;
    _outputLatency(): number;
    _process(inputFrames: number, outputFrames: number): void;
    _flush(outputFrames: number): void;
    _reset(): void;
  }
  export default function createPitch(): Promise<PitchModule>;
}

/** Available only through the test-mode fixed-asset producer. */
declare module 'sniptale:audio-test-assets' {
  export function readAudioFixtureAsset(path: string): Uint8Array<ArrayBuffer>;
}
