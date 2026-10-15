import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runner } = vi.hoisted(() => ({ runner: vi.fn() }));
vi.mock('node:util', () => ({ promisify: () => runner }));
import { provisionQuickPreviewPerformanceFixture } from './quick-preview-performance-fixture';

function validProbe() {
  return {
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'vp8',
        width: 1920,
        height: 1080,
        r_frame_rate: '60/1',
        avg_frame_rate: '60/1',
        nb_read_frames: '2400',
      },
      { index: 1, codec_type: 'audio', codec_name: 'opus' },
    ],
    format: { duration: '40.008' },
    packets: Array.from({ length: 2400 }, (_, index) => ({
      stream_index: 0,
      pts_time: (0.007 + index / 60).toFixed(3),
    })),
  };
}

describe('performance fixture admission', () => {
  let directory: string;
  let metadata: unknown;
  let generationFailure: Error | null;
  let oversized: boolean;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'preview-fixture-'));
    metadata = validProbe();
    generationFailure = null;
    oversized = false;
    runner.mockReset();
    runner.mockImplementation(async (tool: string, args: string[]) => {
      if (args[0] === '-version') return { stdout: `${tool} version test\n` };
      if (tool.endsWith('ffprobe')) return { stdout: JSON.stringify(metadata) };
      const destination = args.at(-1);
      if (!destination) throw new Error('Missing output');
      await writeFile(destination, 'generated-media');
      if (oversized) await truncate(destination, 512 * 1024 * 1024 + 1);
      if (generationFailure) throw generationFailure;
      return { stdout: '' };
    });
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns actual probed metadata and provenance; cached files are probed again', async () => {
    const first = await provisionQuickPreviewPerformanceFixture({ directory });
    expect(first).toMatchObject({ width: 1920, height: 1080, fps: 60, duration: 40.008 });
    expect(first.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.manifest.font.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.manifest.probe.frameCount).toBe(2400);
    const second = await provisionQuickPreviewPerformanceFixture({ directory });
    expect(second.bytes).toEqual(first.bytes);
    const generation = runner.mock.calls.filter(
      ([tool, args]) => tool.endsWith('ffmpeg') && args[0] !== '-version'
    );
    expect(generation).toHaveLength(1);
    expect(
      runner.mock.calls.filter(([tool, args]) => tool.endsWith('ffprobe') && args[0] !== '-version')
    ).toHaveLength(2);
    expect(JSON.parse(await readFile(`${first.path}.json`, 'utf8'))).toEqual(first.manifest);
  });

  it('clones the final burned-in frame for six seconds while audio and timestamps continue', async () => {
    const fixture = await provisionQuickPreviewPerformanceFixture({ directory });
    const args = fixture.manifest.arguments;
    expect(args).toContain('testsrc2=size=1920x1080:rate=60:duration=34');
    const filter = args[args.indexOf('-vf') + 1];
    expect(filter).toContain('drawtext=');
    expect(filter).toMatch(/drawtext=.*?,tpad=stop_mode=clone:stop_duration=6$/);
    expect(args.find((argument) => argument.startsWith('aevalsrc='))).toContain(':d=40');
    expect(args[args.indexOf('-t') + 1]).toBe('40');
    expect(fixture.manifest.heldImage).toEqual({
      start: 34,
      duration: 6,
      audioLandmarksContinue: true,
    });
    expect(fixture.manifest.probe.frameCount).toBe(2400);
  });

  it.each([
    [
      'dimensions',
      () => {
        const value = validProbe();
        value.streams[0]!.width = 160;
        return value;
      },
    ],
    [
      'rate',
      () => {
        const value = validProbe();
        value.streams[0]!.avg_frame_rate = '0/0';
        return value;
      },
    ],
    [
      'duration',
      () => {
        const value = validProbe();
        value.format.duration = 'Infinity';
        return value;
      },
    ],
    [
      'frames',
      () => {
        const value = validProbe();
        value.streams[0]!.nb_read_frames = '2399';
        return value;
      },
    ],
    [
      'timestamps',
      () => {
        const value = validProbe();
        value.packets[30]!.pts_time = '0.1';
        return value;
      },
    ],
    [
      'codec',
      () => {
        const value = validProbe();
        value.streams[1]!.codec_name = 'aac';
        return value;
      },
    ],
    ['packet budget', () => ({ ...validProbe(), packets: Array(10_001).fill(null) })],
    ['unknown object', () => null],
  ])('rejects incorrect %s without publishing a fixture', async (_label, invalid) => {
    metadata = invalid();
    await expect(provisionQuickPreviewPerformanceFixture({ directory })).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });

  it('regenerates a tampered file instead of accepting its manifest', async () => {
    const first = await provisionQuickPreviewPerformanceFixture({ directory });
    await writeFile(first.path, 'tampered');
    const next = await provisionQuickPreviewPerformanceFixture({ directory });
    expect(next.bytes.toString()).toBe('generated-media');
    expect(
      runner.mock.calls.filter(([tool, args]) => tool.endsWith('ffmpeg') && args[0] !== '-version')
    ).toHaveLength(2);
  });

  it.each(['recipe', 'malformed', 'oversized'])('regenerates a %s sidecar', async (kind) => {
    const first = await provisionQuickPreviewPerformanceFixture({ directory });
    const sidecar = `${first.path}.json`;
    if (kind === 'recipe') {
      await writeFile(sidecar, JSON.stringify({ ...first.manifest, recipeSha256: 'outdated' }));
    } else if (kind === 'malformed') {
      await writeFile(sidecar, '{');
    } else {
      await truncate(sidecar, 64 * 1024 + 1);
    }
    await provisionQuickPreviewPerformanceFixture({ directory });
    expect(
      runner.mock.calls.filter(([tool, args]) => tool.endsWith('ffmpeg') && args[0] !== '-version')
    ).toHaveLength(2);
  });

  it('rejects resource abuse before starting tools and bounds every subprocess', async () => {
    await expect(
      provisionQuickPreviewPerformanceFixture({ directory, width: 100_000 })
    ).rejects.toThrow('Unsupported');
    expect(runner).not.toHaveBeenCalled();
    await provisionQuickPreviewPerformanceFixture({ directory });
    for (const [, , options] of runner.mock.calls) {
      expect(options).toMatchObject({ maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL' });
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(900_000);
    }
  });

  it('rejects oversized output before reading it and removes partial files', async () => {
    oversized = true;
    await expect(provisionQuickPreviewPerformanceFixture({ directory })).rejects.toThrow(
      'resource bounds'
    );
    expect(await readdir(directory)).toEqual([]);
  });

  it('propagates generation failure and removes its partial output', async () => {
    generationFailure = new Error('encoder unavailable');
    await expect(provisionQuickPreviewPerformanceFixture({ directory })).rejects.toThrow(
      'encoder unavailable'
    );
    expect(await readdir(directory)).toEqual([]);
  });
});
