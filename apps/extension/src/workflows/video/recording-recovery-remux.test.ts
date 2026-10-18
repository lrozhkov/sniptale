import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  runWithPersistenceMutationTransition,
} from '../../composition/persistence/infrastructure/mutation-barrier';

interface Packet {
  timestamp: number;
  duration: number;
}
interface Track {
  kind: 'video' | 'audio';
  codec: string | null;
  rotation: number;
  getDecoderConfig(): Promise<object | null>;
  determinePacketType(): Promise<string>;
}
const mocks = vi.hoisted(() => ({
  sourceVideo: null as Track | null,
  sourceAudio: null as Track | null,
  resultVideo: null as Track | null,
  resultAudio: null as Track | null,
  videoPackets: [] as Packet[],
  audioPackets: [] as Packet[],
  truncated: false,
  decodedVideo: 1,
  decodedAudio: 1,
  decodeFailure: false,
  inputs: 0,
  writeAt: vi.fn(),
  abort: vi.fn(),
  finalize: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  cancel: vi.fn(),
  start: vi.fn(),
  dispose: vi.fn(),
  closeSample: vi.fn(),
  addVideo: vi.fn(),
  addAudio: vi.fn(),
  format: vi.fn(),
}));
vi.mock('../../composition/persistence/assets', () => ({
  createSeekableAssetObjectWriter: mocks.create,
  readAssetFile: mocks.read,
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    readonly output = ++mocks.inputs % 2 === 0;
    async getPrimaryVideoTrack() {
      return this.output ? mocks.resultVideo : mocks.sourceVideo;
    }
    async getPrimaryAudioTrack() {
      return this.output ? mocks.resultAudio : mocks.sourceAudio;
    }
    dispose() {
      mocks.dispose();
    }
  },
  EncodedPacketSink: class {
    constructor(readonly track: Track) {}
    async getFirstPacket() {
      return this.packets[0] ?? null;
    }
    get packets() {
      return this.track.kind === 'video' ? mocks.videoPackets : mocks.audioPackets;
    }
    async getNextPacket(packet: Packet) {
      const next = this.packets.indexOf(packet) + 1;
      if (mocks.truncated && next === this.packets.length)
        throw new Error('Incomplete container suffix');
      return this.packets[next] ?? null;
    }
  },
  EncodedVideoPacketSource: class {
    add(packet: Packet, config: unknown) {
      return mocks.addVideo(packet, config);
    }
    close() {}
  },
  EncodedAudioPacketSource: class {
    add(packet: Packet, config: unknown) {
      return mocks.addAudio(packet, config);
    }
    close() {}
  },
  Mp4OutputFormat: class {
    constructor() {
      mocks.format('mp4');
    }
  },
  WebMOutputFormat: class {
    constructor() {
      mocks.format('webm');
    }
  },
  StreamTarget: class {
    constructor(readonly stream: WritableStream) {}
  },
  Output: class {
    constructor(readonly options: { target: { stream: WritableStream } }) {}
    addVideoTrack() {}
    addAudioTrack() {}
    start() {
      return mocks.start();
    }
    async finalize() {
      const writer = this.options.target.stream.getWriter();
      try {
        await writer.write({ position: 0, data: new Uint8Array([7, 8]) });
      } finally {
        writer.releaseLock();
      }
    }
    cancel() {
      return mocks.cancel();
    }
  },
  VideoSampleSink: class {
    async *samples() {
      if (mocks.decodeFailure) throw new Error('Invalid encoded frame');
      for (let i = 0; i < mocks.decodedVideo; i++) yield { close: mocks.closeSample };
    }
  },
  AudioSampleSink: class {
    async *samples() {
      for (let i = 0; i < mocks.decodedAudio; i++) yield { close: mocks.closeSample };
    }
  },
}));
import { remuxRecoveryRecording } from './recording-recovery-remux';
function track(kind: Track['kind']): Track {
  return {
    kind,
    codec: kind === 'video' ? 'vp8' : 'opus',
    rotation: 0,
    getDecoderConfig: vi.fn().mockResolvedValue({ codec: kind }),
    determinePacketType: vi.fn().mockResolvedValue('key'),
  };
}
const prepared = { ref: { assetId: 'remux-result' } };
function source(type = 'video/webm') {
  return new File(['original data including broken suffix'], 'source.webm', { type });
}
beforeEach(() => {
  vi.clearAllMocks();
  installPersistenceLockManagerForTests({
    async request(_name, _options, operation) {
      return operation();
    },
  });
  mocks.sourceVideo = track('video');
  mocks.sourceAudio = null;
  mocks.resultVideo = track('video');
  mocks.resultAudio = null;
  mocks.videoPackets = [
    { timestamp: 0, duration: 1 },
    { timestamp: 1, duration: 1 },
  ];
  mocks.audioPackets = [
    { timestamp: 0, duration: 0.5 },
    { timestamp: 0.5, duration: 0.5 },
  ];
  mocks.truncated = false;
  mocks.decodedVideo = 2;
  mocks.decodedAudio = 2;
  mocks.decodeFailure = false;
  mocks.inputs = 0;
  mocks.writeAt.mockResolvedValue(undefined);
  mocks.abort.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(prepared);
  mocks.read.mockResolvedValue(new File(['remuxed output'], 'output.webm'));
  mocks.create.mockResolvedValue({
    writeAt: mocks.writeAt,
    abort: mocks.abort,
    finalize: mocks.finalize,
  });
});
afterEach(() => installPersistenceLockManagerForTests(null));

it.each(['video/webm', 'video/mp4'])(
  'retains readable packets from %s and returns a validated prepared asset',
  async (mime) => {
    mocks.sourceAudio = track('audio');
    mocks.resultAudio = track('audio');
    mocks.truncated = true;
    const original = source(mime);
    const result = await remuxRecoveryRecording(original);
    expect(result.preparedAsset).toBe(prepared);
    expect(mocks.addVideo).toHaveBeenCalledTimes(2);
    expect(mocks.addAudio).toHaveBeenCalledTimes(2);
    const videoOrder = mocks.addVideo.mock.invocationCallOrder;
    const audioOrder = mocks.addAudio.mock.invocationCallOrder;
    expect([videoOrder[0], audioOrder[0], audioOrder[1], videoOrder[1]]).toEqual(
      [...videoOrder, ...audioOrder].sort((a, b) => a - b)
    );
    expect(mocks.writeAt).toHaveBeenCalledWith(0, expect.any(Blob));
    expect(mocks.closeSample).toHaveBeenCalledTimes(4);
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.format).toHaveBeenCalledWith(mime.includes('mp4') ? 'mp4' : 'webm');
    expect(await original.text()).toBe('original data including broken suffix');
    await result.release();
    expect(mocks.abort).toHaveBeenCalledOnce();
  }
);
it('supports a video-only stream without adding an empty audio track', async () => {
  await remuxRecoveryRecording(source());
  expect(mocks.addAudio).not.toHaveBeenCalled();
  expect(mocks.addVideo).toHaveBeenCalledTimes(2);
  expect(mocks.closeSample).toHaveBeenCalledTimes(2);
});
it('reuses the admitted transition when creating the remux output writer', async () => {
  await runWithPersistenceMutationTransition(async (permit) => {
    await remuxRecoveryRecording(source(), permit);
    expect(mocks.create).toHaveBeenCalledWith(
      { mimeType: 'video/webm' },
      { persistenceTransitionPermit: permit }
    );
  });
});
it.each(['missing', 'unknown-codec', 'missing-config', 'not-key', 'empty'])(
  'refuses malformed video %s before publication',
  async (problem) => {
    if (problem === 'missing') mocks.sourceVideo = null;
    if (problem === 'unknown-codec') mocks.sourceVideo!.codec = null;
    if (problem === 'missing-config') mocks.sourceVideo!.getDecoderConfig = async () => null;
    if (problem === 'not-key') mocks.sourceVideo!.determinePacketType = async () => 'delta';
    if (problem === 'empty') mocks.videoPackets = [];
    await expect(remuxRecoveryRecording(source())).rejects.toThrow();
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
  }
);
it.each(['codec', 'config'])(
  'refuses an unreadable audio %s and preserves source bytes',
  async (problem) => {
    mocks.sourceAudio = track('audio');
    if (problem === 'codec') mocks.sourceAudio.codec = null;
    else mocks.sourceAudio.getDecoderConfig = async () => null;
    const original = source();
    await expect(remuxRecoveryRecording(original)).rejects.toThrow('codec configuration');
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(await original.text()).toContain('broken suffix');
  }
);
it.each(['missing-video', 'empty-video', 'decode-error', 'empty-audio'])(
  'refuses output validation failure %s',
  async (failure) => {
    if (failure === 'missing-video') mocks.resultVideo = null;
    if (failure === 'empty-video') mocks.decodedVideo = 0;
    if (failure === 'decode-error') mocks.decodeFailure = true;
    if (failure === 'empty-audio') {
      mocks.resultAudio = track('audio');
      mocks.decodedAudio = 0;
    }
    await expect(remuxRecoveryRecording(source())).rejects.toThrow();
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledTimes(2);
  }
);
it.each(['start', 'packet', 'write', 'finalize', 'read'])(
  'cleans only temporary output on %s failure',
  async (stage) => {
    const failure = new Error(`failed ${stage}`);
    if (stage === 'start') mocks.start.mockRejectedValueOnce(failure);
    if (stage === 'packet') mocks.addVideo.mockRejectedValueOnce(failure);
    if (stage === 'write') mocks.writeAt.mockRejectedValueOnce(failure);
    if (stage === 'finalize') mocks.finalize.mockRejectedValueOnce(failure);
    if (stage === 'read') mocks.read.mockRejectedValueOnce(failure);
    const original = source();
    await expect(remuxRecoveryRecording(original)).rejects.toThrow(`failed ${stage}`);
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(await original.text()).toContain('original data');
  }
);
