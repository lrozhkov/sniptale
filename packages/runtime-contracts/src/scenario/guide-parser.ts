import { z } from 'zod';
import { isPlainRecord } from '../validation/primitives';
import { guideCaptureSourceSchema } from './guide-capture-schema';
import { GUIDE_LIMITS, type GuideProject } from './types/guide';

const id = z
  .string()
  .min(1)
  .max(GUIDE_LIMITS.maxIdLength)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const label = z.string().max(GUIDE_LIMITS.maxLabelLength);
const text = z.string().max(GUIDE_LIMITS.maxTextLength);
const timestamp = z.number().finite().nonnegative();
const link = text.refine((value) => {
  if (
    value.trim() !== value ||
    [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
});
const paragraphs = z
  .array(
    z
      .object({
        runs: z
          .array(
            z
              .object({
                text,
                bold: z.boolean(),
                italic: z.boolean(),
                href: link.nullable(),
              })
              .strict()
          )
          .max(GUIDE_LIMITS.maxRunsPerParagraph),
      })
      .strict()
  )
  .max(GUIDE_LIMITS.maxParagraphs);

const style = z
  .object({
    theme: z.enum(['paper', 'warm', 'graphite']),
    font: z.enum(['sans', 'serif']),
    density: z.enum(['compact', 'comfortable', 'spacious']),
    contentWidth: z.enum(['narrow', 'standard', 'wide']),
    imageBorder: z.enum(['none', 'subtle', 'strong']),
    numberStyle: z.enum(['plain', 'badge']),
    accentColor: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .nullable(),
  })
  .strict();

const image = z
  .object({
    kind: z.literal('image'),
    id,
    assetId: id,
    galleryAssetId: id.nullable(),
    editDocumentId: id.nullable(),
    alt: text,
    caption: text,
    source: z.union([
      guideCaptureSourceSchema,
      z.object({ kind: z.literal('import'), filename: label }).strict(),
      z
        .object({
          kind: z.literal('video-frame'),
          recordingId: id.nullable(),
          filename: label,
          timeSeconds: timestamp,
        })
        .strict(),
    ]),
    frame: z
      .object({
        width: z.number().finite().positive().max(GUIDE_LIMITS.maxDimension),
        height: z.number().finite().positive().max(GUIDE_LIMITS.maxDimension),
      })
      .strict(),
    fit: z.enum(['contain', 'cover']),
    contentTransform: z
      .object({
        x: z.number().finite().min(-100).max(100),
        y: z.number().finite().min(-100).max(100),
        scale: z.number().finite().positive().max(100),
      })
      .strict(),
  })
  .strict();

const projectSchema: z.ZodType<GuideProject> = z
  .object({
    version: z.literal(4),
    id,
    name: label,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: z.array(label).max(GUIDE_LIMITS.maxTags),
    style,
    print: z
      .object({
        pageSize: z.enum(['a4', 'letter']),
        orientation: z.enum(['portrait', 'landscape']),
        pagination: z.enum(['flow', 'step']),
      })
      .strict(),
    items: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('section'), id, title: label, paragraphs }).strict(),
          z
            .object({
              kind: z.literal('step'),
              id,
              title: label,
              showNumber: z.boolean(),
              layout: z.enum(['stacked', 'side-by-side', 'comparison', 'text']),
              templateId: id.nullable(),
              styleOverrides: style.partial().strict(),
              blocks: z
                .array(
                  z.discriminatedUnion('kind', [
                    z.object({ kind: z.literal('heading'), id, text }).strict(),
                    z.object({ kind: z.literal('text'), id, paragraphs }).strict(),
                    z
                      .object({
                        kind: z.literal('note'),
                        id,
                        tone: z.enum(['neutral', 'info', 'warning', 'error']),
                        paragraphs,
                      })
                      .strict(),
                    image,
                  ])
                )
                .max(GUIDE_LIMITS.maxBlocksPerStep),
            })
            .strict(),
        ])
      )
      .max(GUIDE_LIMITS.maxItems),
  })
  .strict();

/** Unsupported versions are distinct from corruption; callers must not treat either as absent. */
export type GuideParseResult =
  | { status: 'ok'; project: GuideProject }
  | { status: 'unsupported'; version: number }
  | { status: 'invalid' };

/** Parses a detached document without conversion, migration, repair or external effects. */
export function parseGuideProject(value: unknown): GuideParseResult {
  if (!isBoundedGuideInput(value) || !isPlainRecord(value)) return { status: 'invalid' };
  const version = value['version'];
  if (
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version > 0 &&
    version !== 4
  ) {
    return { status: 'unsupported', version };
  }
  const result = projectSchema.safeParse(value);
  if (!result.success || !hasUniqueGuideIds(result.data)) return { status: 'invalid' };
  return { status: 'ok', project: result.data };
}

function hasUniqueGuideIds(project: GuideProject): boolean {
  const seen = new Set([project.id]);
  for (const item of project.items) {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    if (item.kind !== 'step') continue;
    for (const block of item.blocks) {
      if (seen.has(block.id)) return false;
      seen.add(block.id);
    }
  }
  return true;
}

function isBoundedGuideInput(value: unknown): boolean {
  const ancestors = new WeakSet<object>();
  let visits = 0;
  let textLength = 0;
  function visit(current: unknown, depth: number): boolean {
    if (++visits > GUIDE_LIMITS.maxInputVisits || depth > GUIDE_LIMITS.maxInputDepth) return false;
    if (typeof current === 'string') {
      textLength += current.length;
      return textLength <= GUIDE_LIMITS.maxInputTextLength;
    }
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current !== 'object' || ancestors.has(current)) return false;
    if (
      !Array.isArray(current) &&
      Object.getPrototypeOf(current) !== Object.prototype &&
      Object.getPrototypeOf(current) !== null
    )
      return false;
    const keys = Object.keys(current);
    if (keys.length + visits > GUIDE_LIMITS.maxInputVisits) return false;
    if (Array.isArray(current) && keys.length !== current.length) return false;
    ancestors.add(current);
    for (const key of keys) {
      textLength += key.length;
      if (textLength > GUIDE_LIMITS.maxInputTextLength) return false;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor) || !visit(descriptor.value, depth + 1))
        return false;
    }
    ancestors.delete(current);
    return true;
  }
  return visit(value, 0);
}
