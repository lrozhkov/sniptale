import { z } from 'zod';
import { multiplyColorAlpha } from '@sniptale/foundation/color';
import { parsePaint, type Paint } from '@sniptale/foundation/paint';
import { SYSTEM_BORDER_PRESET_KEYS } from '../highlighter/border-preset';
import { ANNOTATION_TEMPLATE_TAG_LIMITS } from '../highlighter/annotation-template-tags';

export const BorderPaddingSchema = z.object({
  top: z.number().int().min(0).max(50),
  left: z.number().int().min(0).max(50),
  right: z.number().int().min(0).max(50),
  bottom: z.number().int().min(0).max(50),
});

const HexColorWithOptionalAlphaSchema = z.union([
  z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  z.string().regex(/^#[0-9A-Fa-f]{8}$/),
]);

const BorderPresetEffectsSchema = z.object({
  blur: z.object({
    amount: z.number().min(1).max(25),
    blurType: z.enum(['gaussian', 'distortion', 'pixelate', 'solid']),
  }),
  focus: z.object({
    blurAmount: z.number().min(0).max(25),
    opacity: z.number().min(0).max(1),
  }),
  capture: z.object({ hideFrame: z.boolean() }),
  linkedTemplates: z
    .object({
      calloutPresetId: z.string().min(1).nullable(),
      stepBadgePresetId: z.string().min(1).nullable(),
    })
    .optional(),
});

const PaintSchema = z.unknown().transform((value, context): Paint => {
  const paint = parsePaint(value);
  if (paint) return paint;
  context.addIssue({ code: 'custom', message: 'Invalid Paint value' });
  return z.NEVER;
});

const CanonicalBorderPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0),
  width: z.number().int().min(1).max(20),
  color: HexColorWithOptionalAlphaSchema,
  style: z.enum(['solid', 'dashed', 'dotted']),
  radius: z.number().int().min(0).max(50),
  padding: BorderPaddingSchema,
  shadow: z.number().int().min(0).max(100),
  fillPaint: PaintSchema,
  inheritCustomCss: z.boolean(),
  customCss: z.string().max(1000),
  effects: BorderPresetEffectsSchema.optional(),
  origin: z.enum(['system', 'user']).optional(),
  systemPresetKey: z.enum(SYSTEM_BORDER_PRESET_KEYS).optional(),
  basedOnRevision: z.number().int().min(0).optional(),
  customized: z.boolean().optional(),
  tagIds: z
    .array(z.string().min(1))
    .max(ANNOTATION_TEMPLATE_TAG_LIMITS.maximumTagsPerTemplate)
    .refine((tagIds) => new Set(tagIds).size === tagIds.length),
});

function migrateLegacyBorderPreset(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const withTags = input['tagIds'] === undefined ? { ...input, tagIds: [] } : input;
  if (input['fillPaint'] !== undefined || typeof input['fillColor'] !== 'string') return withTags;
  const fillOpacity = input['fillOpacity'];
  if (
    fillOpacity !== undefined &&
    (typeof fillOpacity !== 'number' || !Number.isFinite(fillOpacity))
  ) {
    return withTags;
  }
  const color =
    typeof fillOpacity === 'number'
      ? multiplyColorAlpha(input['fillColor'], fillOpacity / 100)
      : input['fillColor'];
  if (!color) return withTags;
  return { ...withTags, fillPaint: { kind: 'solid', color } };
}

export const BorderPresetSchema = z.preprocess(
  migrateLegacyBorderPreset,
  CanonicalBorderPresetSchema
);

export const BlurSettingsSchema = z.object({
  amount: z.number().int().min(1).max(50),
  blurType: z.enum(['gaussian', 'distortion', 'pixelate', 'solid']),
  borderPresetId: z.string().min(1).nullable().optional(),
  radius: z.number().int().min(0).max(50).optional(),
  shadow: z.number().int().min(0).max(100).optional(),
  showBorder: z.boolean().optional(),
  strokeColor: HexColorWithOptionalAlphaSchema.optional(),
  strokeStyle: z
    .enum(['solid', 'dashed', 'dotted', 'dash', 'dot', 'dash-dot', 'long-dash'])
    .optional(),
  strokeWidth: z.number().int().min(0).max(24).optional(),
});

export const FocusSettingsSchema = z.object({
  blurAmount: z.number().min(0).max(25).optional(),
  opacity: z.number().min(0).max(1.0),
  showBorder: z.boolean().optional(),
});

export const HighlighterSettingsSchema = z.object({
  borderPresets: z.array(BorderPresetSchema).min(1),
  defaultBorderPresetId: z.string().min(1),
  defaultEffectMode: z.enum(['border', 'blur', 'focus']),
  defaultBlurSettings: BlurSettingsSchema,
  defaultFocusSettings: FocusSettingsSchema,
  systemPresetCatalogRevision: z.number().int().min(0),
  catalogCustomized: z.boolean().optional(),
});

export type BorderPaddingSchemaType = z.infer<typeof BorderPaddingSchema>;
export type BorderPresetSchemaType = z.infer<typeof BorderPresetSchema>;
export type BlurSettingsSchemaType = z.infer<typeof BlurSettingsSchema>;
export type FocusSettingsSchemaType = z.infer<typeof FocusSettingsSchema>;
export type HighlighterSettingsSchemaType = z.infer<typeof HighlighterSettingsSchema>;
