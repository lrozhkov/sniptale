import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const DURATION = 40;
const HELD_DURATION = 6;
const MAX_BYTES = 512 * 1024 * 1024;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const RECIPE = 'quick-preview-testsrc2-flash-tone-held-v2';

interface QuickPreviewPerformanceFixtureOptions {
  width?: number;
  height?: number;
  fps?: number;
  directory?: string;
}

interface Profile {
  width: number;
  height: number;
  fps: number;
}

interface ProbeSummary extends Profile {
  duration: number;
  frameCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

interface QuickPreviewPerformanceFixtureManifest {
  recipe: string;
  recipeSha256: string;
  sha256: string;
  tools: { ffmpeg: string; ffprobe: string };
  font: { path: string; sha256: string };
  probe: ProbeSummary;
  arguments: string[];
  heldImage: { start: number; duration: number; audioLandmarksContinue: boolean };
}

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function profileFor(options: QuickPreviewPerformanceFixtureOptions): Profile {
  const { width = 1920, height = 1080, fps = 60 } = options;
  const dimensions = [
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ];
  if (!dimensions.some(([w, h]) => w === width && h === height) || ![30, 60].includes(fps)) {
    throw new Error('Unsupported performance fixture dimensions or frame rate');
  }
  return { width, height, fps };
}

async function run(tool: string, args: string[], generation = false): Promise<string> {
  const result = await execute(tool, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: generation ? 15 * 60_000 : 120_000,
    killSignal: 'SIGKILL',
  });
  return result.stdout;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid ffprobe object');
  return Object.fromEntries(Object.entries(value));
}

function numeric(value: unknown): number {
  if (typeof value !== 'string' || value.length > 64) throw new Error('Invalid ffprobe number');
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const parts = unsigned.split('.');
  if (parts.length > 2 || !parts.every((part) => /^\d+$/.test(part)))
    throw new Error('Invalid ffprobe number');
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('Nonfinite ffprobe number');
  return result;
}

function rate(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+\/[1-9]\d*$/.test(value))
    throw new Error('Invalid ffprobe rate');
  const [numerator, denominator] = value.split('/').map(Number);
  if (numerator === undefined || denominator === undefined) throw new Error('Missing ffprobe rate');
  return numerator / denominator;
}

function parseProbe(input: unknown, profile: Profile): ProbeSummary {
  const root = record(input);
  if (!Array.isArray(root.streams) || root.streams.length !== 2 || !Array.isArray(root.packets)) {
    throw new Error('Expected video and audio streams with packets');
  }
  const streams = root.streams.map(record);
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (!video || video.codec_name !== 'vp8' || !audio || audio.codec_name !== 'opus') {
    throw new Error('Expected VP8 and Opus codecs');
  }
  if (
    video.width !== profile.width ||
    video.height !== profile.height ||
    rate(video.r_frame_rate) !== profile.fps ||
    rate(video.avg_frame_rate) !== profile.fps
  ) {
    throw new Error('Fixture dimensions or rate do not match recipe');
  }
  const frameCount = numeric(video.nb_read_frames);
  const duration = numeric(record(root.format).duration);
  if (frameCount !== DURATION * profile.fps || Math.abs(duration - DURATION) > 0.1) {
    throw new Error('Fixture duration or frame count does not match recipe');
  }
  if (root.packets.length > 10_000) throw new Error('Fixture packet budget exceeded');
  const timestamps = root.packets
    .map(record)
    .filter((packet) => packet.stream_index === video.index)
    .map((packet) => numeric(packet.pts_time));
  if (timestamps.length !== frameCount) throw new Error('Missing video timestamps');
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps.at(-1);
  if (
    firstTimestamp === undefined ||
    lastTimestamp === undefined ||
    Math.abs(firstTimestamp) > 0.02
  ) {
    throw new Error('Invalid initial video timestamp');
  }
  timestamps.forEach((timestamp, index) => {
    if (Math.abs(timestamp - firstTimestamp - index / profile.fps) > 0.002) {
      throw new Error('Nonuniform video timestamps');
    }
  });
  return { ...profile, duration, frameCount, firstTimestamp, lastTimestamp };
}

async function probe(path: string, profile: Profile): Promise<ProbeSummary> {
  const output = await run('/usr/bin/ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-show_streams',
    '-show_format',
    '-show_packets',
    '-show_entries',
    'stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_r' +
      'ead_frames:format=duration:packet=stream_index,pts_time',
    '-of',
    'json',
    path,
  ]);
  const parsed: unknown = JSON.parse(output);
  return parseProbe(parsed, profile);
}

function generationArguments(profile: Profile): string[] {
  const { width, height, fps } = profile;
  const drawing =
    `drawbox=x=0:y=0:w=120:h=120:color=white:t=fill:enable='lt(mod(t,1),0.05)',` +
    [
      'drawtext=fontfile=',
      String(FONT),
      ":text='frame %{n} time %{pts\\:hms}':x=140:y=30:fontsize=48:fontcolor=white:box=1",
      ':boxcolor=black',
    ].join('');
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}:rate=${fps}:duration=${DURATION - HELD_DURATION}`,
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=if(lt(mod(t\\,1)\\,0.05)\\,0.2*sin(2*PI*880*t)\\,0):s=48000:d=${DURATION}`,
    // Clone after burn-in so the held image does not change with output timestamps.
    '-vf',
    `${drawing},tpad=stop_mode=clone:stop_duration=${HELD_DURATION}`,
    '-c:v',
    'libvpx',
    '-deadline',
    'good',
    '-cpu-used',
    '4',
    '-threads',
    '1',
    '-b:v',
    '0',
    '-crf',
    '20',
    '-g',
    String(fps * 2),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'libopus',
    '-b:a',
    '96k',
    '-t',
    String(DURATION),
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-f',
    'webm',
  ];
}

async function boundedBytes(path: string): Promise<Buffer> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_BYTES) {
    throw new Error('Fixture file exceeds resource bounds');
  }
  return readFile(path);
}

async function reusable(path: string, recipeSha256: string, profile: Profile) {
  try {
    const sidecar = await stat(`${path}.json`);
    if (!sidecar.isFile() || sidecar.size > 64 * 1024) return null;
    const saved: unknown = JSON.parse(await readFile(`${path}.json`, 'utf8'));
    const manifest = record(saved);
    if (manifest.recipeSha256 !== recipeSha256) return null;
    const bytes = await boundedBytes(path);
    if (manifest.sha256 !== hash(bytes)) return null;
    return { bytes, probe: await probe(path, profile) };
  } catch {
    return null;
  }
}

/** Provision a generated, probed source; never substitute metadata for actual media. */
export async function provisionQuickPreviewPerformanceFixture(
  options: QuickPreviewPerformanceFixtureOptions = {}
) {
  const profile = profileFor(options);
  const directory = resolve(options.directory ?? '.tmp/preview-performance-fixtures');
  const path = join(directory, `${profile.height}p${profile.fps}.webm`);
  const [ffmpeg, ffprobe, fontBytes] = await Promise.all([
    run('/usr/bin/ffmpeg', ['-version']),
    run('/usr/bin/ffprobe', ['-version']),
    readFile(FONT),
  ]);
  const tools = { ffmpeg: ffmpeg.trim(), ffprobe: ffprobe.trim() };
  const font = { path: FONT, sha256: hash(fontBytes) };
  const args = generationArguments(profile);
  const recipeSha256 = hash(JSON.stringify({ recipe: RECIPE, profile, tools, font, args }));
  await mkdir(directory, { recursive: true });
  let result = await reusable(path, recipeSha256, profile);
  if (!result) {
    const temporary = `${path}.${randomUUID()}.partial`;
    try {
      await run('/usr/bin/ffmpeg', [...args, temporary], true);
      result = { bytes: await boundedBytes(temporary), probe: await probe(temporary, profile) };
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  const manifest: QuickPreviewPerformanceFixtureManifest = {
    recipe: RECIPE,
    recipeSha256,
    sha256: hash(result.bytes),
    tools,
    font,
    probe: result.probe,
    arguments: args,
    heldImage: {
      start: DURATION - HELD_DURATION,
      duration: HELD_DURATION,
      audioLandmarksContinue: true,
    },
  };
  await writeFile(`${path}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return { bytes: result.bytes, ...profile, duration: result.probe.duration, path, manifest };
}
