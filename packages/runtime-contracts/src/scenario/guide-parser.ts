import { parseTourDocument, tourDocumentSchema } from './tour-parser';
import { z } from 'zod';
import { isPlainRecord } from '../validation/primitives';
import { scenarioImageSourceSchema } from './image-source-schema';
export { guideVideoActionSchema, guideVideoFrameSourceSchema } from './image-source-schema';
import { isBoundedScenarioInput } from './input-bounds';
import { GUIDE_LIMITS, type GuideProject } from './types/guide';

const id = z
  .string()
  .min(1)
  .max(GUIDE_LIMITS.maxIdLength)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const restartAt = z.number().int().min(1).max(GUIDE_LIMITS.maxRestartNumber);
const numbering = z
  .object({
    restartAt: restartAt.optional(),
    label: z
      .string()
      .min(1)
      .max(GUIDE_LIMITS.maxNumberLabelLength)
      .refine((value) => value.trim().length > 0)
      .optional(),
  })
  .strict()
  .optional();
const textStyle = z
  .object({
    size: z.enum(['small', 'normal', 'large']),
    alignment: z.enum(['start', 'center', 'end']),
  })
  .strict()
  .optional();
const minHeight = z.number().int().min(0).max(GUIDE_LIMITS.maxDimension).optional();
const rowStart = z.boolean().optional();
const width = z
  .union([
    z.enum(['full', 'half']),
    z.number().int().min(GUIDE_LIMITS.minBlockWidthPercent).max(100),
  ])
  .optional();
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

const htmlExport = z
  .object({
    content: z.enum(['full', 'frame']),
    optimize: z.boolean(),
    maxEdge: z.union([z.literal(1280), z.literal(1920), z.literal(2560), z.literal(4096)]),
    quality: z.union([z.literal(0.75), z.literal(0.85), z.literal(0.95)]),
    viewer: z.boolean(),
  })
  .strict()
  .optional();

const image = z
  .object({
    kind: z.literal('image'),
    htmlExport,
    id,
    width,
    rowStart,
    assetId: id,
    galleryAssetId: id.nullable(),
    editDocumentId: id.nullable(),
    alt: text,
    caption: text,
    source: scenarioImageSourceSchema,
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

/** Presentation fields share their admission rules with AI proposals. */
export const guideStepParametersSchema = z
  .object({
    showNumber: z.boolean(),
    numbering,
    layout: z.enum(['stacked', 'side-by-side', 'comparison', 'text']),
    styleOverrides: style.partial().strict(),
  })
  .strict();
const noteTone = z.enum(['neutral', 'info', 'warning', 'error']);
/** Safe parameter surfaces exclude content identity and media ownership. */
export const guideBlockParameterSchemas = {
  heading: z.object({ width, rowStart, minHeight, textStyle }).strict(),
  text: z.object({ width, rowStart, minHeight, textStyle }).strict(),
  note: z.object({ width, rowStart, minHeight, textStyle, tone: noteTone.optional() }).strict(),
  image: image
    .pick({
      width: true,
      rowStart: true,
      frame: true,
      fit: true,
      contentTransform: true,
      htmlExport: true,
    })
    .partial()
    .strict(),
  'image-slot': image
    .pick({ width: true, rowStart: true, frame: true, fit: true })
    .partial()
    .strict(),
};

const projectSchema = z
  .object({
    version: z.literal(4),
    tour: tourDocumentSchema.optional(),
    purpose: z.literal('step-template').optional(),
    htmlExport,
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
          z
            .object({
              kind: z.literal('section'),
              id,
              title: label,
              paragraphs,
              numbering: z.object({ restartAt }).strict().optional(),
            })
            .strict(),
          z
            .object({
              kind: z.literal('step'),
              id,
              title: label,
              ...guideStepParametersSchema.shape,
              templateId: id.nullable(),
              blocks: z
                .array(
                  z.discriminatedUnion('kind', [
                    z
                      .object({
                        kind: z.literal('heading'),
                        id,
                        text,
                        ...guideBlockParameterSchemas.heading.shape,
                      })
                      .strict(),
                    z
                      .object({
                        kind: z.literal('text'),
                        id,
                        paragraphs,
                        ...guideBlockParameterSchemas.text.shape,
                      })
                      .strict(),
                    z
                      .object({
                        kind: z.literal('note'),
                        id,
                        ...guideBlockParameterSchemas.note.shape,
                        tone: noteTone,
                        paragraphs,
                      })
                      .strict(),
                    image,
                    image
                      .pick({
                        id: true,
                        width: true,
                        rowStart: true,
                        frame: true,
                        fit: true,
                        alt: true,
                        caption: true,
                      })
                      .extend({ kind: z.literal('image-slot') })
                      .strict(),
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

/** Canonical editable document schemas, reused by AI without admitting persistence identity. */
export const guideDocumentParametersSchema = projectSchema
  .pick({
    name: true,
    tags: true,
    style: true,
    print: true,
    htmlExport: true,
  })
  .partial()
  .strict();
export const guideItemSchemas = {
  section: projectSchema.shape.items.element.options[0],
  step: projectSchema.shape.items.element.options[1],
};

/** Unsupported versions are distinct from corruption; callers must not treat either as absent. */
export type GuideParseResult =
  | { status: 'ok'; project: GuideProject }
  | { status: 'unsupported'; version: number; representation?: 'tour' }
  | { status: 'invalid' };

/** Parses a detached document without conversion, migration, repair or external effects. */
export function parseGuideProject(value: unknown): GuideParseResult {
  if (!isBoundedScenarioInput(value) || !isPlainRecord(value)) return { status: 'invalid' };
  const version = value['version'];
  if (
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version > 0 &&
    version !== 4
  ) {
    return { status: 'unsupported', version };
  }
  if (value['tour'] !== undefined) {
    const tour = parseTourDocument(value['tour']);
    if (tour.status === 'unsupported') return { ...tour, representation: 'tour' };
    if (tour.status !== 'ok') return { status: 'invalid' };
  }
  const result = projectSchema.safeParse(value);
  if (!result.success || !hasUniqueGuideIds(result.data)) return { status: 'invalid' };
  if (
    result.data.purpose === 'step-template' &&
    (result.data.tour !== undefined ||
      result.data.items.length !== 1 ||
      result.data.items[0]?.kind !== 'step')
  )
    return { status: 'invalid' };
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
