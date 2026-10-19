import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../apps/extension/src/features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../apps/extension/src/features/video/project/factories/clip';
import { syncPreviewAudioElements } from '../../../apps/extension/src/video-editor/preview/stage/runtime/audio-elements';
import { createPreviewMediaSyncState } from '../../../apps/extension/src/video-editor/preview/stage/media/sync';
import { collectRenderableAudioClips } from '../../../apps/extension/src/offscreen/project-export/offline-audio/clip-audio/collect';
import { scheduleOfflineAudioClipMix } from '../../../apps/extension/src/offscreen/project-export/offline-audio/mix/schedule';
import { runOriginalAudioDiagnostic } from './original-audio-diagnostic';
import {
  cleanupPreviewAudioGraph,
  createPreviewAudioGraphState,
  ensurePreviewAudioGraphNode,
  setPreviewAudioNodeGain,
} from '../../../apps/extension/src/video-editor/preview/stage/runtime/playback/audio-graph';
import * as previewAudioDriver from '../../../apps/extension/src/video-editor/preview/stage/runtime/playback/audio-driver';

type PreviewAudioDiagnosticEvent = {
  atMs: number;
  currentTime: number;
  graphState: AudioContextState | 'missing';
  paused: boolean;
  playbackRate: number;
  readyState: number;
  type: string;
};

type PreviewAudioDiagnosticScenario = {
  counts: Record<string, number>;
  events: PreviewAudioDiagnosticEvent[];
  label: 'audio-only' | 'video-with-audio';
  project: {
    clipId: string;
    clipType: 'audio' | 'video';
    duration: number;
    hasAudio: boolean;
  };
};

type PreviewAudioDiagnosticResult = {
  scenarios: PreviewAudioDiagnosticScenario[];
};

type PreviewAudioDiagnosticApi = {
  runAmplification: typeof runAmplificationDiagnostic;
  runOriginalAudio: typeof runOriginalAudioDiagnostic;
  getLastResult: () => PreviewAudioDiagnosticResult | null;
  run: () => Promise<PreviewAudioDiagnosticResult>;
};

type DriverScenarioContext = {
  audio: HTMLAudioElement;
  events: PreviewAudioDiagnosticEvent[];
  record: (type: string) => void;
  startedAt: number;
  state: ReturnType<typeof createPreviewAudioGraphState>;
  stopRecording: () => void;
};

declare global {
  interface Window {
    __sniptalePreviewAudioDiagnostic?: PreviewAudioDiagnosticApi;
  }
}

const DIAGNOSTIC_SAMPLE_RATE = 48_000;
const DIAGNOSTIC_DURATION_SECONDS = 2;
const DIAGNOSTIC_RUN_MS = 750;
const DIAGNOSTIC_TICK_MS = 50;
const DRIVER_EVENTS = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'stalled',
  'timeupdate',
] as const;

function encodeSineWavePcm16(durationSeconds: number): Uint8Array {
  const sampleCount = Math.floor(DIAGNOSTIC_SAMPLE_RATE * durationSeconds);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  writeWavHeader(view, sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / DIAGNOSTIC_SAMPLE_RATE);
    view.setInt16(44 + index * 2, Math.round(sample * 0x3fff), true);
  }

  return bytes;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function writeWavHeader(view: DataView, sampleCount: number): void {
  const byteRate = DIAGNOSTIC_SAMPLE_RATE * 2;
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, DIAGNOSTIC_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);
}

function createDiagnosticAudioUrl(): string {
  const bytes = encodeSineWavePcm16(DIAGNOSTIC_DURATION_SECONDS);
  const wavBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(wavBuffer).set(bytes);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function waitForCanPlay(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('canplay', resolveReady);
      audio.removeEventListener('error', rejectError);
    };
    const resolveReady = () => {
      cleanup();
      resolve();
    };
    const rejectError = () => {
      cleanup();
      reject(new Error('Preview audio diagnostic asset failed to load'));
    };

    audio.addEventListener('canplay', resolveReady, { once: true });
    audio.addEventListener('error', rejectError, { once: true });
    audio.load();
  });
}

function countEvents(events: PreviewAudioDiagnosticEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function configureDiagnosticAudio(audio: HTMLAudioElement): void {
  audio.defaultMuted = false;
  audio.muted = false;
  audio.volume = 1;
  audio.playbackRate = 1;
}

function createDriverScenarioContext(): DriverScenarioContext {
  const state = createPreviewAudioGraphState();
  const events: PreviewAudioDiagnosticEvent[] = [];
  const audio = new Audio(createDiagnosticAudioUrl());
  const startedAt = performance.now();
  let recording = true;
  configureDiagnosticAudio(audio);

  const record = (type: string) => {
    if (!recording) {
      return;
    }

    events.push({
      atMs: Math.round(performance.now() - startedAt),
      currentTime: audio.currentTime,
      graphState: state.audioContext?.state ?? 'missing',
      paused: audio.paused,
      playbackRate: audio.playbackRate,
      readyState: audio.readyState,
      type,
    });
  };

  return {
    audio,
    events,
    record,
    startedAt,
    state,
    stopRecording: () => {
      recording = false;
    },
  };
}

function attachDriverEventRecorders(context: DriverScenarioContext): void {
  DRIVER_EVENTS.forEach((eventName) => {
    context.audio.addEventListener(eventName, () => context.record(eventName));
  });
}

async function runSteadyDriverTicks(context: DriverScenarioContext, label: string): Promise<void> {
  const { audio, record, state } = context;
  await waitForCanPlay(audio);
  const node = ensurePreviewAudioGraphNode(state, `${label}-clip`, audio);
  if (!node) {
    throw new Error(`Preview audio graph node was not created for ${label}`);
  }

  setPreviewAudioNodeGain(node, 0.02);
  previewAudioDriver.requestPreviewAudioDriverPlayback(state, `${label}-clip`, audio);

  while (performance.now() - context.startedAt < DIAGNOSTIC_RUN_MS) {
    setPreviewAudioNodeGain(node, 0.02);
    previewAudioDriver.requestPreviewAudioDriverPlayback(state, `${label}-clip`, audio);
    record('tick');
    await delay(DIAGNOSTIC_TICK_MS);
  }
}

function buildScenarioResult(
  context: DriverScenarioContext,
  label: PreviewAudioDiagnosticScenario['label']
): PreviewAudioDiagnosticScenario {
  return {
    counts: countEvents(context.events),
    events: context.events,
    label,
    project: {
      clipId: `${label}-clip`,
      clipType: label === 'audio-only' ? 'audio' : 'video',
      duration: DIAGNOSTIC_DURATION_SECONDS,
      hasAudio: true,
    },
  };
}

function cleanupDriverScenario(context: DriverScenarioContext): void {
  context.stopRecording();
  context.audio.pause();
  cleanupPreviewAudioGraph(context.state);
  URL.revokeObjectURL(context.audio.src);
}

async function runDriverScenario(
  label: PreviewAudioDiagnosticScenario['label']
): Promise<PreviewAudioDiagnosticScenario> {
  const context = createDriverScenarioContext();
  attachDriverEventRecorders(context);
  await runSteadyDriverTicks(context, label);
  const result = buildScenarioResult(context, label);
  cleanupDriverScenario(context);
  return result;
}

async function runPreviewAudioDiagnostic(): Promise<PreviewAudioDiagnosticResult> {
  return {
    scenarios: [await runDriverScenario('audio-only'), await runDriverScenario('video-with-audio')],
  };
}

let activeRun: Promise<PreviewAudioDiagnosticResult> | null = null;
let lastResult: PreviewAudioDiagnosticResult | null = null;

function runOnce(): Promise<PreviewAudioDiagnosticResult> {
  activeRun ??= runPreviewAudioDiagnostic().then((result) => {
    lastResult = result;
    return result;
  });
  return activeRun;
}

window.__sniptalePreviewAudioDiagnostic = {
  getLastResult: () => lastResult,
  runOriginalAudio: runOriginalAudioDiagnostic,
  runAmplification: runAmplificationDiagnostic,
  run: runOnce,
};

document.getElementById('run-preview-audio-diagnostic')?.addEventListener('click', () => {
  void runOnce().then((result) => {
    const output = document.getElementById('preview-audio-diagnostic-output');
    if (output) {
      output.textContent = JSON.stringify(result, null, 2);
    }
  });
});

function rootMeanSquare(samples: Float32Array) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
}

async function runAmplificationDiagnostic() {
  const results = [];
  for (const { volume, master } of [
    { volume: 1.5, master: 1 },
    { volume: 2, master: 1 },
    { volume: 1.5, master: 2 },
    { volume: 2, master: 2 },
    { volume: 1.5, master: 0 },
  ]) {
    const context = createDriverScenarioContext();
    try {
      await waitForCanPlay(context.audio);
      const project = createEmptyVideoProject('Amplified preview');
      const asset = createVideoProjectAsset(
        'Native sine',
        'AUDIO',
        { kind: 'project-asset', projectAssetId: 'native-sine' },
        {
          width: 0,
          height: 0,
          duration: 2,
          mimeType: 'audio/wav',
          size: 1,
          hasAudio: true,
          audioPeaks: null,
        }
      );
      const track = createVideoProjectTrack('Music', 1, 'AUDIO');
      track.audioVolume = master;
      project.tracks.push(track);
      const clip = createAudioClipFromAsset(track.id, asset);
      clip.volume = volume;
      project.assets = [asset];
      project.clips = [clip];
      project.duration = 2;
      const before = JSON.stringify(project);
      syncPreviewAudioElements({
        audioRefs: { current: { [clip.id]: context.audio } },
        audioGraphState: context.state,
        currentTime: 0,
        isPlaying: true,
        mediaSyncState: createPreviewMediaSyncState(),
        project,
        syncedClips: [clip],
      });
      const node = context.state.nodesByClipId.get(clip.id);
      const live = context.state.audioContext;
      if (!node || !live) throw new Error('Native preview graph unavailable');
      const analyser = live.createAnalyser();
      analyser.fftSize = 4096;
      node.gain.connect(analyser);
      const deadline = performance.now() + 3000;
      while (master > 0 && (context.audio.currentTime < 0.2 || live.state !== 'running')) {
        if (performance.now() > deadline) throw new Error('Native amplified preview did not start');
        await delay(25);
      }
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      const previewRms = rootMeanSquare(samples);
      const buffer = await live.decodeAudioData(
        await (await fetch(context.audio.src)).arrayBuffer()
      );
      const offline = new OfflineAudioContext(1, DIAGNOSTIC_SAMPLE_RATE, DIAGNOSTIC_SAMPLE_RATE);
      for (const input of collectRenderableAudioClips(project)) {
        await scheduleOfflineAudioClipMix(offline, input, buffer);
      }
      const rendered = await offline.startRendering();
      results.push({
        volume,
        master,
        gain: node.gain.gain.value,
        elementVolume: context.audio.volume,
        previewRms,
        exportRms: rootMeanSquare(rendered.getChannelData(0).slice(9600, 13696)),
        expectedRms: volume * master * rootMeanSquare(buffer.getChannelData(0).slice(9600, 13696)),
        unchanged: before === JSON.stringify(project),
      });
      analyser.disconnect();
    } finally {
      cleanupDriverScenario(context);
    }
  }
  return results;
}
