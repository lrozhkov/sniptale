import { z } from 'zod';

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

export const BorderPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  isSystemDefault: z.boolean().optional(),
  order: z.number().int().min(0),
  width: z.number().int().min(1).max(20),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  style: z.enum(['solid', 'dashed', 'dotted']),
  radius: z.number().int().min(0).max(50),
  padding: BorderPaddingSchema,
  shadow: z.number().int().min(0).max(100),
  opacity: z.number().int().min(0).max(100),
  strokeOpacity: z.number().int().min(0).max(100),
  fillColor: HexColorWithOptionalAlphaSchema,
  fillOpacity: z.number().int().min(0).max(100),
  inheritCustomCss: z.boolean(),
  customCss: z.string().max(1000),
});

export const BlurSettingsSchema = z.object({
  amount: z.number().int().min(1).max(50),
  blurType: z.enum(['gaussian', 'distortion', 'pixelate', 'solid']),
  borderPresetId: z.string().min(1).nullable().optional(),
  radius: z.number().int().min(0).max(50).optional(),
  shadow: z.number().int().min(0).max(100).optional(),
  showBorder: z.boolean().optional(),
  strokeColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  strokeStyle: z
    .enum(['solid', 'dashed', 'dotted', 'dash', 'dot', 'dash-dot', 'long-dash'])
    .optional(),
  strokeWidth: z.number().int().min(0).max(24).optional(),
});

export const FocusSettingsSchema = z.object({
  opacity: z.number().min(0.1).max(1.0),
  showBorder: z.boolean().optional(),
});

export const HighlighterSettingsSchema = z.object({
  borderPresets: z.array(BorderPresetSchema).min(1),
  defaultBorderPresetId: z.string().min(1),
  defaultEffectMode: z.enum(['border', 'blur', 'focus']),
  defaultBlurSettings: BlurSettingsSchema,
  defaultFocusSettings: FocusSettingsSchema,
});

export type BorderPaddingSchemaType = z.infer<typeof BorderPaddingSchema>;
export type BorderPresetSchemaType = z.infer<typeof BorderPresetSchema>;
export type BlurSettingsSchemaType = z.infer<typeof BlurSettingsSchema>;
export type FocusSettingsSchemaType = z.infer<typeof FocusSettingsSchema>;
export type HighlighterSettingsSchemaType = z.infer<typeof HighlighterSettingsSchema>;
