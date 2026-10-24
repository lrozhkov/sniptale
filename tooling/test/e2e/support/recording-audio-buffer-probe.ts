import { createLiveAudioTimestampTransform } from '../../../../apps/extension/src/offscreen/recording/encoding/live-audio-timeline';
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  WavOutputFormat,
  canEncodeAudio,
} from 'mediabunny';
import { beginRecordingSession } from '../../../../apps/extension/src/composition/audio-recording/capture';
import { resolveRecordingMimeType } from '../../../../apps/extension/src/composition/audio-recording/format';
import type { RecordingSessionArgs } from '../../../../apps/extension/src/composition/audio-recording/session-types';

/** Holds processing while a native reader delivers a controlled burst, then checks retained PCM. */
export async function recordNativeAudioBurst(
  packetFrames: number,
  channels = 1,
  mode: 'held-pcm' | 'native-opus' = 'held-pcm',
  packets = mode === 'native-opus' ? 128 : 130
) {
  const original = globalThis.MediaStreamTrackProcessor;
  const audio = new AudioContext({ sampleRate: 48000 });
  const destination = audio.createMediaStreamDestination();
  const track = destination.stream.getAudioTracks()[0]!;
  let readerController!: ReadableStreamDefaultController<AudioData>;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const processing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let consumed!: () => void;
  const consumption = new Promise<void>((resolve) => {
    consumed = resolve;
  });
  let readPackets = 0;
  const readable = new ReadableStream<AudioData>({
    start(controller) {
      readerController = controller;
    },
  });
  Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', {
    configurable: true,
    value: class {
      readable = {
        getReader() {
          const reader = readable.getReader();
          return {
            closed: reader.closed,
            async read() {
              const next = await reader.read();
              if (!next.done) readPackets += 1;
              if (next.done || readPackets === packets) consumed();
              return next;
            },
            cancel(reason?: unknown) {
              consumed();
              return reader.cancel(reason);
            },
            releaseLock() {
              reader.releaseLock();
            },
          };
        },
      };
    },
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: mode === 'native-opus' ? new WebMOutputFormat() : new WavOutputFormat(),
  });
  let held = false;
  const source = new MediaStreamAudioTrackSource(track, {
    codec: mode === 'native-opus' ? 'opus' : 'pcm-s16',
    ...(mode === 'native-opus' ? { bitrate: 128000 } : {}),
    transform: {
      process: async (sample) => {
        if (mode === 'held-pcm' && !held) {
          held = true;
          entered();
          await gate;
        }
        return sample;
      },
    },
  });
  let error: string | null = null;
  void source.errorPromise.catch((failure: unknown) => {
    error = failure instanceof Error ? failure.message : 'Audio source failed';
  });
  output.addAudioTrack(source);
  const enqueue = (index: number) =>
    readerController.enqueue(
      new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfChannels: channels,
        numberOfFrames: packetFrames,
        timestamp: Math.round((index * packetFrames * 1e6) / 48000),
        data: Float32Array.from({ length: packetFrames * channels }, (_, frame) =>
          mode === 'native-opus'
            ? 0.1 * Math.sin((2 * Math.PI * 440 * (index * packetFrames + frame)) / 48000)
            : 0.25
        ),
      })
    );
  try {
    await output.start();
    enqueue(0);
    if (mode === 'held-pcm') await processing;
    for (let index = 1; index < packets; index += 1) enqueue(index);
    readerController.close();
    await consumption;
    // Native input can arrive in one burst before asynchronous encoder startup finishes.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const heldError = error;
    release();
    if (heldError) {
      await output.cancel();
      return {
        error: heldError,
        frames: 0,
        changed: 0,
        rms: 0,
        borrowedTrackState: track.readyState,
      };
    }
    await output.finalize();
    if (!target.buffer) throw new Error('Audio burst output is empty');
    const decoded = await audio.decodeAudioData(target.buffer.slice(0));
    const samples = decoded.getChannelData(0);
    return {
      error,
      frames: samples.length,
      rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
      changed: samples.reduce(
        (count, value) => count + (Math.abs(value - 0.25) > 1 / 32768 ? 1 : 0),
        0
      ),
      borrowedTrackState: track.readyState,
    };
  } finally {
    release();
    if (output.state !== 'finalized') await output.cancel();
    Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', {
      configurable: true,
      value: original,
    });
    destination.stream.getTracks().forEach((item) => item.stop());
    await audio.close();
  }
}

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

/** Replays a capture-clock phase error without changing the continuous PCM payload. */
export async function recordAudioTimestampJitter(codec: 'aac' | 'opus', genuineGap: boolean) {
  if (!(await canEncodeAudio(codec, { numberOfChannels: 2, sampleRate: 48000 }))) {
    return { supported: false as const };
  }
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: codec === 'aac' ? new Mp4OutputFormat() : new WebMOutputFormat(),
  });
  const blocks: { frames: number; timestamp: number; zeros: number; changed: number }[] = [];
  const source = new AudioSampleSource({
    codec,
    bitrate: 128000,
    transform: { process: createLiveAudioTimestampTransform() },
    onEncodedSample(sample) {
      const values = new Float32Array(sample.numberOfFrames);
      sample.copyTo(values, { planeIndex: 0, format: 'f32-planar' });
      blocks.push({
        frames: sample.numberOfFrames,
        timestamp: sample.timestamp,
        zeros: values.filter((value) => value === 0).length,
        changed: values.filter((value) => value !== 0.1875 && value !== 0).length,
      });
    },
  });
  output.addAudioTrack(source);
  try {
    await output.start();
    for (let index = 0; index < 600; index += 1) {
      const phase = genuineGap ? (index >= 210 ? 0.01 : 0) : index === 210 ? 0.0015 : 0;
      const sample = new AudioSample({
        data: new Float32Array(960).fill(0.1875),
        format: 'f32-planar',
        numberOfChannels: 2,
        numberOfFrames: 480,
        sampleRate: 48000,
        timestamp: 0.37 + index * 0.01 + phase,
      });
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
    }
    await output.finalize();
    return { supported: true as const, blocks, bytes: target.buffer?.byteLength ?? 0 };
  } finally {
    if (output.state !== 'finalized') await output.cancel();
  }
}
