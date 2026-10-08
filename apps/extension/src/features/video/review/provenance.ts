import { normalizePaintColor } from '@sniptale/foundation/paint';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewOperation, parseReviewSource } from './validation';
import { buildReviewTimeMap } from './timeline';
import type { ReviewEdit, ReviewSource } from './types';
import {
  createNeutralPresentationSettings,
  type QuickEditPresentationSettings,
} from './advanced/presentation';
import {
  planReviewPresentationSequence,
  type PresentationSequencePlan,
  type PresentationRate,
} from './presentation-sequence';

/** Embedded edit provenance follows the output bytes through downloads and media backups. Times are seconds. */
export interface ReviewProvenanceBase {
  timeUnit: 'seconds';
  source: ReviewSource & { filename: string };
  revision: number;
  exportedAt: number;
  edits: ReviewEdit[];
  audioReencoded: boolean;
}

const maxLength = 1_048_576;

/** Descriptive baked output; no resource identities or restoration instructions are embedded. */
export interface ReviewPresentationProvenance {
  baked: true;
  includeBookends: boolean;
  watermarkBaked: boolean;
  output: {
    format: 'mp4' | 'webm';
    videoCodec: 'avc' | 'hevc' | 'vp8' | 'vp9';
    width: number;
    height: number;
    frameRateMode: 'constant' | 'adaptive';
  };
  rate: PresentationRate;
  totalDurationUs: number;
  fragmentOffset: number;
  color: string;
  endColor?: string;
  visualEnvelope: PresentationSequencePlan['visualEnvelope'];
  audioEnvelope: PresentationSequencePlan['audioEnvelope'];
  segments: {
    name: 'intro' | 'main' | 'outro';
    kind: 'image' | 'video' | 'main';
    startUs: number;
    endUs: number;
    audioStart: number;
    audioEnd: number;
    contentDuration: number;
    sourceTrim?: { start: number; end: number };
  }[];
}

/** v1 remains the nonpresentation export contract and a supported read format. */
export type ReviewExportProvenance = ReviewProvenanceBase &
  (
    | { format: 'sniptale.video-edit.v1' }
    | { format: 'sniptale.video-edit.v2'; presentation: ReviewPresentationProvenance }
  );

function parseBase(data: Record<string, unknown>): ReviewProvenanceBase | null {
  if (data['timeUnit'] !== 'seconds') return null;
  const source = parseReviewSource(data['source']);
  const filename = isRecord(data['source']) ? data['source']['filename'] : undefined;
  const revision = data['revision'];
  const exportedAt = data['exportedAt'];
  const audioReencoded = data['audioReencoded'];
  if (
    !source ||
    typeof filename !== 'string' ||
    !filename.length ||
    filename.length > 4096 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof exportedAt !== 'number' ||
    !Number.isSafeInteger(exportedAt) ||
    exportedAt < 0 ||
    typeof audioReencoded !== 'boolean' ||
    !Array.isArray(data['edits'])
  )
    return null;
  const edits: ReviewEdit[] = [];
  const ids = new Set<string>();
  const values: readonly unknown[] = data['edits'];
  for (const value of values) {
    const operation = parseReviewOperation(
      { id: 'provenance', at: 0, target: 'edit', before: null, after: value },
      source.duration
    );
    if (operation?.target !== 'edit' || !operation.after || ids.has(operation.after.id))
      return null;
    edits.push(operation.after);
    ids.add(operation.after.id);
  }
  try {
    buildReviewTimeMap(source.duration, edits);
  } catch {
    return null;
  }
  return {
    timeUnit: 'seconds',
    source: { ...source, filename },
    revision,
    exportedAt,
    edits,
    audioReencoded,
  };
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number =>
  nonnegative(value) && Number.isSafeInteger(value);

function parseOutput(value: unknown): ReviewPresentationProvenance['output'] | null {
  if (!isRecord(value)) return null;
  const { format, videoCodec, width, height, frameRateMode } = value;
  if (
    (format !== 'mp4' && format !== 'webm') ||
    (videoCodec !== 'avc' &&
      videoCodec !== 'hevc' &&
      videoCodec !== 'vp8' &&
      videoCodec !== 'vp9') ||
    !integer(width) ||
    !integer(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    (frameRateMode !== 'constant' && frameRateMode !== 'adaptive')
  )
    return null;
  if (
    format === 'mp4'
      ? videoCodec !== 'avc' && videoCodec !== 'hevc' && videoCodec !== 'vp9'
      : videoCodec !== 'vp8' && videoCodec !== 'vp9'
  )
    return null;
  return { format, videoCodec, width, height, frameRateMode };
}

function parseSegment(value: unknown): ReviewPresentationProvenance['segments'][number] | null {
  if (!isRecord(value)) return null;
  const { name, kind, startUs, endUs, audioStart, audioEnd, contentDuration, sourceTrim } = value;
  if (
    (name !== 'intro' && name !== 'main' && name !== 'outro') ||
    (kind !== 'image' && kind !== 'video' && kind !== 'main') ||
    (name === 'main') !== (kind === 'main') ||
    !integer(startUs) ||
    !integer(endUs) ||
    endUs <= startUs ||
    !integer(audioStart) ||
    !integer(audioEnd) ||
    audioEnd < audioStart ||
    !finite(contentDuration) ||
    contentDuration <= 0 ||
    contentDuration > 86400
  )
    return null;
  const base: ReviewPresentationProvenance['segments'][number] = {
    name,
    kind,
    startUs,
    endUs,
    audioStart,
    audioEnd,
    contentDuration,
  };
  if (kind !== 'video') return sourceTrim === undefined ? base : null;
  if (
    !isRecord(sourceTrim) ||
    !nonnegative(sourceTrim['start']) ||
    !finite(sourceTrim['end']) ||
    sourceTrim['end'] <= sourceTrim['start'] ||
    sourceTrim['end'] > 3600
  )
    return null;
  return { ...base, sourceTrim: { start: sourceTrim['start'], end: sourceTrim['end'] } };
}

function slotFor(
  segment: ReviewPresentationProvenance['segments'][number]
): QuickEditPresentationSettings['intro'] {
  const frame = {
    assetId: 'descriptive-only',
    fit: 'contain' as const,
    fillColor: '#000000ff',
    crop: { panX: 0, panY: 0 },
  };
  if (segment.kind === 'video' && segment.sourceTrim)
    return {
      mode: 'video',
      video: {
        ...frame,
        source: {
          duration: segment.sourceTrim.end,
          width: 1,
          height: 1,
          mimeType: 'video/webm',
          size: 1,
        },
        trim: segment.sourceTrim,
        audio: { muted: true, gain: 0 },
      },
    };
  return {
    mode: 'image',
    image: { ...frame, width: 1, height: 1, duration: segment.contentDuration },
  };
}

function projectSegments(plan: PresentationSequencePlan): ReviewPresentationProvenance['segments'] {
  return plan.segments.map((segment) => ({
    name: segment.name,
    kind: segment.content.kind,
    startUs: segment.startUs,
    endUs: segment.endUs,
    audioStart: segment.audioStart,
    audioEnd: segment.audioEnd,
    contentDuration: segment.contentDuration,
    ...(segment.content.kind === 'video'
      ? { sourceTrim: { start: segment.content.sourceStart, end: segment.content.sourceEnd } }
      : {}),
  }));
}

function parseEnvelope(
  value: unknown,
  span: number
): PresentationSequencePlan['visualEnvelope'] | null {
  if (
    !isRecord(value) ||
    value['span'] !== span ||
    !nonnegative(value['fadeIn']) ||
    !nonnegative(value['fadeOut']) ||
    value['fadeIn'] + value['fadeOut'] > span + Number.EPSILON * Math.max(1, span) * 4
  )
    return null;
  return { span, fadeIn: value['fadeIn'], fadeOut: value['fadeOut'] };
}

/** Reuses the sequence planner as the sole authority for cumulative frame/audio quantization. */
function verifySequenceTiming(
  value: Pick<
    ReviewPresentationProvenance,
    'segments' | 'rate' | 'color' | 'fragmentOffset' | 'includeBookends'
  > & { totalDurationUs: unknown },
  base: ReviewProvenanceBase
): PresentationSequencePlan | null {
  const main = value.segments.find((segment) => segment.name === 'main');
  if (
    !main ||
    main.contentDuration !== buildReviewTimeMap(base.source.duration, base.edits).at(-1)?.resultEnd
  )
    return null;
  const settings = createNeutralPresentationSettings();
  settings.color = value.color;
  for (const segment of value.segments)
    if (segment.name !== 'main') settings[segment.name] = slotFor(segment);
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: main.contentDuration,
    fragmentOffset: value.fragmentOffset,
    includeBookends: value.includeBookends,
    rate: value.rate,
  });
  if (
    !result.ok ||
    JSON.stringify(projectSegments(result.plan)) !== JSON.stringify(value.segments) ||
    result.plan.totalDurationUs !== value.totalDurationUs ||
    result.plan.color !== value.color ||
    result.plan.rate.numerator !== value.rate.numerator ||
    result.plan.rate.denominator !== value.rate.denominator
  )
    return null;
  return result.plan;
}

function parsePresentation(
  value: unknown,
  base: ReviewProvenanceBase
): ReviewPresentationProvenance | null {
  if (
    !isRecord(value) ||
    value['baked'] !== true ||
    typeof value['includeBookends'] !== 'boolean' ||
    typeof value['watermarkBaked'] !== 'boolean' ||
    !nonnegative(value['fragmentOffset']) ||
    !isRecord(value['rate']) ||
    !integer(value['rate']['numerator']) ||
    !integer(value['rate']['denominator']) ||
    !Array.isArray(value['segments']) ||
    value['segments'].length < 1 ||
    value['segments'].length > 3
  )
    return null;
  const endColor =
    value['endColor'] === undefined
      ? undefined
      : typeof value['endColor'] === 'string'
        ? normalizePaintColor(value['endColor'])
        : null;
  if (endColor === null || (endColor !== undefined && !endColor.endsWith('ff'))) return null;
  const output = parseOutput(value['output']);
  const segments: ReviewPresentationProvenance['segments'] = [];
  for (const candidate of value['segments']) {
    const segment = parseSegment(candidate);
    if (!segment) return null;
    segments.push(segment);
  }
  if (!output || typeof value['color'] !== 'string') return null;
  const rate = { numerator: value['rate']['numerator'], denominator: value['rate']['denominator'] };
  const plan = verifySequenceTiming(
    {
      segments,
      rate,
      color: value['color'],
      fragmentOffset: value['fragmentOffset'],
      includeBookends: value['includeBookends'],
      totalDurationUs: value['totalDurationUs'],
    },
    base
  );
  if (!plan) return null;
  const visualEnvelope = parseEnvelope(value['visualEnvelope'], plan.visualEnvelope.span);
  const audioEnvelope = parseEnvelope(value['audioEnvelope'], plan.audioEnvelope.span);
  if (!visualEnvelope || !audioEnvelope) return null;
  return {
    baked: true,
    includeBookends: value['includeBookends'],
    watermarkBaked: value['watermarkBaked'],
    output,
    rate,
    totalDurationUs: plan.totalDurationUs,
    fragmentOffset: value['fragmentOffset'],
    color: plan.color,
    ...(endColor ? { endColor } : {}),
    visualEnvelope,
    audioEnvelope,
    segments,
  };
}

/** Unknown, malformed and future comments remain descriptive and never become editable history. */
export function parseReviewProvenance(value: unknown): ReviewExportProvenance | null {
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    new TextEncoder().encode(value).length > maxLength
  )
    return null;
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !isRecord(data) ||
    (data['format'] !== 'sniptale.video-edit.v1' && data['format'] !== 'sniptale.video-edit.v2')
  )
    return null;
  const base = parseBase(data);
  if (!base) return null;
  if (data['format'] === 'sniptale.video-edit.v1') return { format: data['format'], ...base };
  const presentation = parsePresentation(data['presentation'], base);
  return presentation ? { format: data['format'], ...base, presentation } : null;
}

/** Projects an admitted sequence plan without retaining scene assets or authored resource settings. */
export function createPresentationReviewProvenance(args: {
  base: ReviewProvenanceBase;
  plan: PresentationSequencePlan;
  output: ReviewPresentationProvenance['output'];
  includeBookends: boolean;
  watermarkBaked: boolean;
}): Extract<ReviewExportProvenance, { format: 'sniptale.video-edit.v2' }> {
  const main = args.plan.segments.find((segment) => segment.content.kind === 'main');
  if (main?.content.kind !== 'main')
    throw new Error('Presentation provenance requires main content.');
  const value = parseReviewProvenance(
    JSON.stringify({
      ...args.base,
      format: 'sniptale.video-edit.v2',
      presentation: {
        baked: true,
        includeBookends: args.includeBookends,
        watermarkBaked: args.watermarkBaked,
        output: args.output,
        rate: args.plan.rate,
        totalDurationUs: args.plan.totalDurationUs,
        fragmentOffset: main.content.fragmentOffset,
        color: args.plan.color,
        ...(args.plan.endColor ? { endColor: args.plan.endColor } : {}),
        visualEnvelope: args.plan.visualEnvelope,
        audioEnvelope: args.plan.audioEnvelope,
        segments: projectSegments(args.plan),
      },
    })
  );
  if (value?.format !== 'sniptale.video-edit.v2')
    throw new Error('Presentation provenance is invalid or too large.');
  return value;
}

/** Refuses oversized metadata and serializes only the canonical descriptive projection. */
export function encodeReviewProvenance(value: ReviewExportProvenance): string {
  const parsed = parseReviewProvenance(JSON.stringify(value));
  if (!parsed) throw new Error('Export provenance is invalid or too large.');
  return JSON.stringify(parsed);
}
