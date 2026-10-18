import {
  AudioMixerGraph,
  createMicrophoneHighPass,
} from '../../../../apps/extension/src/offscreen/recording/stream/audio-mixer-graph';
import { BufferTarget, MediaStreamAudioTrackSource, Output, WebMOutputFormat } from 'mediabunny';
import { beginRecordingSession } from '../../../../apps/extension/src/composition/audio-recording/capture';
import { resolveRecordingMimeType } from '../../../../apps/extension/src/composition/audio-recording/format';
import type { RecordingSessionArgs } from '../../../../apps/extension/src/composition/audio-recording/session-types';

/** Records a continuous native audio track while the document thread performs long tasks. */
export async function recordContinuousAudioUnderLoad(load: boolean, pause = false) {
  const audio = new AudioContext({ sampleRate: 48000 });
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const destination = audio.createMediaStreamDestination();
  oscillator.frequency.value = 440;
  gain.gain.value = 0.1;
  oscillator.connect(gain).connect(destination);
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const source = new MediaStreamAudioTrackSource(
    destination.stream.getAudioTracks()[0]!,
    { codec: 'opus', bitrate: 128000 },
    { timestampBase: 'synced-zero' }
  );
  const errors: string[] = [];
  void source.errorPromise.catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : 'Audio source failed');
  });
  output.addAudioTrack(source);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await audio.resume();
    oscillator.start();
    await output.start();
    if (load) {
      timer = setInterval(() => {
        const end = performance.now() + 180;
        while (performance.now() < end) {
          // Reproduce a document long task while the native audio thread keeps producing samples.
        }
      }, 240);
    }
    if (pause) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      source.pause();
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      source.resume();
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 4000));
    }
    clearInterval(timer);
    timer = undefined;
    await output.finalize();
    if (!target.buffer) throw new Error('Audio recording is empty');
    const decoded = await audio.decodeAudioData(target.buffer.slice(0));
    return measureContinuity(decoded, errors);
  } finally {
    clearInterval(timer);
    oscillator.stop();
    destination.stream.getTracks().forEach((track) => track.stop());
    if (output.state !== 'finalized') await output.cancel();
    await audio.close();
  }
}

function measureContinuity(decoded: AudioBuffer, errors: string[]) {
  const data = decoded.getChannelData(0);
  const windowSize = Math.round(decoded.sampleRate * 0.01);
  let quietWindows = 0;
  let longestQuietWindows = 0;
  const first = Math.round(decoded.sampleRate * 0.5);
  const last = data.length - Math.round(decoded.sampleRate * 0.2);
  for (let start = first; start + windowSize < last; start += windowSize) {
    let squares = 0;
    for (let index = start; index < start + windowSize; index += 1) {
      squares += data[index]! ** 2;
    }
    const rms = Math.sqrt(squares / windowSize);
    quietWindows = rms < 0.0035 ? quietWindows + 1 : 0;
    longestQuietWindows = Math.max(longestQuietWindows, quietWindows);
  }
  return {
    errors,
    duration: decoded.duration,
    longestQuietSeconds: longestQuietWindows * 0.01,
    sampleRate: decoded.sampleRate,
  };
}

/** Exercises the editor's microphone capture owner with a controlled input and native MediaRecorder. */
export async function recordMicrophoneTrackUnderLoad(load: boolean) {
  const audio = new AudioContext({ sampleRate: 48000 });
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const destination = audio.createMediaStreamDestination();
  oscillator.frequency.value = 440;
  gain.gain.value = 0.1;
  oscillator.connect(gain).connect(destination);
  const original = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async () => destination.stream;
  const errors: string[] = [];
  let complete!: (blob: Blob) => void;
  const recorded = new Promise<Blob>((resolve) => {
    complete = resolve;
  });
  let audioUrl: string | null = null;
  const args: RecordingSessionArgs = {
    mimeType: resolveRecordingMimeType() ?? '',
    errors: {
      noSupport: 'unsupported',
      permissionDenied: 'denied',
      startFailed: 'failed',
      playFailed: 'play',
    },
    refs: {
      chunksRef: { current: [] },
      mediaRecorderRef: { current: null },
      sessionRef: { current: 1 },
      streamRef: { current: null },
      timerRef: { current: null },
      clockRef: { current: null },
    },
    state: {
      audioBlob: null,
      audioRef: { current: null },
      audioUrl: null,
      durationSeconds: 0,
      error: null,
      isPlayingSelection: false,
      recordedDuration: 0,
      status: 'idle',
      trimEnd: 0,
      trimStart: 0,
      setAudioBlob: (value) => {
        if (value instanceof Blob) complete(value);
      },
      setAudioUrl: (value) => {
        if (typeof value === 'string') audioUrl = value;
      },
      setDurationSeconds: () => {},
      setIsPlayingSelection: () => {},
      setRecordedDuration: () => {},
      setStatus: () => {},
      setTrimEnd: () => {},
      setTrimStart: () => {},
      setError: (value) => {
        if (typeof value === 'string') errors.push(value);
      },
    },
    clearTimer: () => {
      if (args.refs.timerRef.current !== null) clearInterval(args.refs.timerRef.current);
    },
    stopStream: () => destination.stream.getTracks().forEach((track) => track.stop()),
    resetSession: () => {
      args.clearTimer();
      args.stopStream();
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await audio.resume();
    oscillator.start();
    await beginRecordingSession(args);
    const recorder = args.refs.mediaRecorderRef.current;
    if (!recorder) throw new Error('Microphone capture did not start');
    if (load)
      timer = setInterval(() => {
        const end = performance.now() + 180;
        while (performance.now() < end) {
          /* Simulate the same document long task as live recording. */
        }
      }, 240);
    await new Promise<void>((resolve) => setTimeout(resolve, 4000));
    clearInterval(timer);
    timer = undefined;
    recorder.stop();
    const blob = await recorded;
    const decoded = await audio.decodeAudioData(await blob.arrayBuffer());
    return {
      ...measureContinuity(decoded, errors),
      released: destination.stream.getTracks().every((track) => track.readyState === 'ended'),
    };
  } finally {
    clearInterval(timer);
    args.clearTimer();
    if (args.refs.mediaRecorderRef.current?.state === 'recording')
      args.refs.mediaRecorderRef.current.stop();
    args.stopStream();
    oscillator.stop();
    navigator.mediaDevices.getUserMedia = original;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    await audio.close();
  }
}

/** Separates retained and excluded signals while the actual output writer cannot progress. */
export async function recordPausedSignalWithWriterStall(blockDuringPause = false) {
  const { AppendOnlyStreamTarget } = await import('mediabunny');
  const audio = new AudioContext({ sampleRate: 48000 });
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const destination = audio.createMediaStreamDestination();
  oscillator.frequency.value = 500;
  gain.gain.value = 0.1;
  oscillator.connect(gain).connect(destination);
  let arm = false;
  let signalStall!: () => void;
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => {
    signalStall = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const target = new AppendOnlyStreamTarget(
    new WritableStream<Uint8Array>({
      async write(chunk) {
        if (arm) {
          arm = false;
          signalStall();
          await gate;
        }
        chunks.push(new Uint8Array(chunk));
      },
    })
  );
  const output = new Output({
    target,
    format: new WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 0 }),
  });
  const source = new MediaStreamAudioTrackSource(destination.stream.getAudioTracks()[0]!, {
    codec: 'opus',
    bitrate: 128000,
  });
  const errors: string[] = [];
  void source.errorPromise.catch((error: unknown) =>
    errors.push(error instanceof Error ? error.message : 'source failed')
  );
  output.addAudioTrack(source);
  try {
    await audio.resume();
    oscillator.start();
    await output.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    arm = true;
    await stalled;
    oscillator.frequency.value = 750;
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    source.pause();
    oscillator.frequency.value = 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, blockDuringPause ? 100 : 250));
    if (blockDuringPause) {
      const end = performance.now() + 180;
      while (performance.now() < end) {
        // A paused native capture can accumulate frames before the resume command executes.
      }
    }
    oscillator.frequency.value = 500;
    source.resume();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    release();
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    await output.finalize();
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const decoded = await audio.decodeAudioData(await blob.arrayBuffer());
    const data = decoded.getChannelData(0);
    const length = Math.round(decoded.sampleRate * 0.02);
    const counts = { base: 0, accepted: 0, paused: 0 };
    for (let start = 0; start + length <= data.length; start += length) {
      for (const [name, frequency] of [
        ['base', 500],
        ['accepted', 750],
        ['paused', 1000],
      ] as const) {
        let real = 0,
          imaginary = 0;
        for (let index = 0; index < length; index += 1) {
          const angle = (2 * Math.PI * frequency * index) / decoded.sampleRate;
          real += data[start + index]! * Math.cos(angle);
          imaginary += data[start + index]! * Math.sin(angle);
        }
        if ((2 * Math.hypot(real, imaginary)) / length > 0.03) counts[name] += 1;
      }
    }
    return { errors, counts, duration: decoded.duration };
  } finally {
    release();
    if (output.state !== 'finalized') await output.cancel();
    oscillator.stop();
    destination.stream.getTracks().forEach((track) => track.stop());
    await audio.close();
  }
}

/** Exercises bounded failure and source cancellation with an actual held output writer. */
export async function stopAudioWithWriterStall(overflow: boolean) {
  const { AppendOnlyStreamTarget } = await import('mediabunny');
  const audio = new AudioContext({ sampleRate: 48000 });
  const oscillator = audio.createOscillator();
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(destination);
  let arm = false;
  let signalStall!: () => void;
  let release!: () => void;
  const stalled = new Promise<void>((resolve) => {
    signalStall = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const output = new Output({
    target: new AppendOnlyStreamTarget(
      new WritableStream<Uint8Array>({
        async write() {
          if (arm) {
            arm = false;
            signalStall();
            await gate;
          }
        },
      })
    ),
    format: new WebMOutputFormat({ appendOnly: true, minimumClusterDuration: 0 }),
  });
  const track = destination.stream.getAudioTracks()[0]!;
  const source = new MediaStreamAudioTrackSource(track, { codec: 'opus', bitrate: 128000 });
  const failure = source.errorPromise.catch((error: unknown) =>
    error instanceof Error ? error.message : 'source failed'
  );
  output.addAudioTrack(source);
  try {
    await audio.resume();
    oscillator.start();
    await output.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    arm = true;
    await stalled;
    const error = overflow ? await failure : null;
    // Cancel with pending audio, then let the target finish its in-flight write.
    const canceled = output.cancel();
    release();
    await canceled;
    const borrowedTrackState = track.readyState;
    return { error, borrowedTrackState };
  } finally {
    release();
    if (output.state !== 'canceled') await output.cancel();
    oscillator.stop();
    track.stop();
    await audio.close();
  }
}

/** Measures a low-frequency microphone burst after the production mixer and native audio encoder. */
export async function recordConditionedMicrophone(gain: number) {
  const audio = new AudioContext({ sampleRate: 48000 });
  const microphone = audio.createMediaStreamDestination();
  const tab = audio.createMediaStreamDestination();
  const signal = audio.createBuffer(1, 48000 * 3, 48000);
  const samples = signal.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / 48000;
    const envelope = Math.max(0, Math.min(1, (time - 0.5) / 0.05, (1.5 - time) / 0.05));
    samples[index] =
      0.08 * Math.sin(2 * Math.PI * 300 * time) +
      0.8 * envelope * Math.sin(2 * Math.PI * 20 * time);
  }
  const voice = audio.createBufferSource();
  voice.buffer = signal;
  voice.connect(microphone);
  const tabTone = audio.createOscillator();
  const tabGain = audio.createGain();
  tabTone.frequency.value = 40;
  tabGain.gain.value = 0.06;
  tabTone.connect(tabGain).connect(tab);
  const graph = new AudioMixerGraph();
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const errors: string[] = [];
  try {
    await audio.resume();
    await graph.initialize();
    graph.connectMicrophoneStream(microphone.stream, gain);
    graph.connectTabStream(tab.stream);
    const source = new MediaStreamAudioTrackSource(graph.getMixedStream().getAudioTracks()[0]!, {
      codec: 'opus',
      bitrate: 128000,
    });
    void source.errorPromise.catch((error: unknown) => errors.push(String(error)));
    output.addAudioTrack(source);
    await output.start();
    voice.start(audio.currentTime + 0.1);
    tabTone.start();
    await new Promise<void>((resolve) => setTimeout(resolve, 2300));
    await output.finalize();
    if (!target.buffer) throw new Error('Conditioned recording is empty');
    const decoded = await audio.decodeAudioData(target.buffer.slice(0));
    const data = decoded.getChannelData(0);
    const length = Math.round(decoded.sampleRate * 0.25);
    const amplitudes = { low: 0, voice: 0, tab: 0 };
    let peak = 0;
    for (let start = length; start + length < data.length - length; start += length) {
      for (const [name, frequency] of [
        ['low', 20],
        ['voice', 300],
        ['tab', 40],
      ] as const) {
        let real = 0;
        let imaginary = 0;
        for (let index = 0; index < length; index += 1) {
          const value = data[start + index]!;
          const angle = (2 * Math.PI * frequency * index) / decoded.sampleRate;
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
          peak = Math.max(peak, Math.abs(value));
        }
        amplitudes[name] = Math.max(amplitudes[name], (2 * Math.hypot(real, imaginary)) / length);
      }
    }
    return {
      errors,
      peak,
      duration: decoded.duration,
      encoded: Array.from(new Uint8Array(target.buffer)),
      low: amplitudes.low,
      voice: amplitudes.voice,
      tab: amplitudes.tab,
      borrowedTracksLive: [...microphone.stream.getTracks(), ...tab.stream.getTracks()].every(
        (track) => track.readyState === 'live'
      ),
    };
  } finally {
    if (output.state !== 'finalized') await output.cancel();
    voice.stop();
    tabTone.stop();
    await graph.cleanup();
    microphone.stream.getTracks().forEach((track) => track.stop());
    tab.stream.getTracks().forEach((track) => track.stop());
    await audio.close();
  }
}

/** Uses the production microphone filter with a fixed sample clock and an unfiltered system channel. */
export async function renderMicrophoneConditioning() {
  const sampleRate = 48000;
  const audio = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
  const microphone = audio.createBuffer(1, sampleRate * 2, sampleRate);
  const data = microphone.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.max(0, Math.min(1, (time - 0.5) / 0.05, (1.5 - time) / 0.05));
    data[index] =
      0.08 * Math.sin(2 * Math.PI * 300 * time) +
      0.8 * envelope * Math.sin(2 * Math.PI * 20 * time);
  }
  const source = audio.createBufferSource();
  source.buffer = microphone;
  source.connect(createMicrophoneHighPass(audio)).connect(audio.destination);
  const tab = audio.createOscillator();
  const tabGain = audio.createGain();
  tab.frequency.value = 40;
  tabGain.gain.value = 0.06;
  tab.connect(tabGain).connect(audio.destination);
  source.start();
  tab.start();
  const rendered = (await audio.startRendering()).getChannelData(0);
  let peak = 0;
  for (const value of rendered) peak = Math.max(peak, Math.abs(value));
  const amplitude = (frequency: number, start: number, end: number) => {
    let real = 0;
    let imaginary = 0;
    const first = Math.round(start * sampleRate);
    const last = Math.round(end * sampleRate);
    for (let index = first; index < last; index += 1) {
      const angle = (2 * Math.PI * frequency * index) / sampleRate;
      real += rendered[index]! * Math.cos(angle);
      imaginary += rendered[index]! * Math.sin(angle);
    }
    return (2 * Math.hypot(real, imaginary)) / (last - first);
  };
  return {
    peak,
    low: amplitude(20, 0.75, 1.25),
    voiceClean: amplitude(300, 0.1, 0.4),
    voiceDuringBurst: amplitude(300, 0.75, 1.25),
    tab: amplitude(40, 0.75, 1.25),
  };
}
