import { z } from 'zod';

/** Geometry is expressed in em, except font size which is a fraction of the output height. */
const color = z.string().regex(/^#[0-9a-f]{6}$/iu);

export const REVIEW_TEXT_FONT_FAMILIES = [
  'golos',
  'literata',
  'jetbrains-mono',
  'oswald',
  'legacy',
] as const;

export const reviewTextTypefaces = {
  golos: { minWeight: 400, maxWeight: 900 },
  literata: { minWeight: 200, maxWeight: 900 },
  'jetbrains-mono': { minWeight: 100, maxWeight: 800 },
  oswald: { minWeight: 200, maxWeight: 700 },
  legacy: { minWeight: 400, maxWeight: 900 },
} satisfies Record<
  (typeof REVIEW_TEXT_FONT_FAMILIES)[number],
  {
    minWeight: number;
    maxWeight: number;
  }
>;

const appearanceSchema = z
  .strictObject({
    version: z.literal(1),
    family: z.enum(REVIEW_TEXT_FONT_FAMILIES),
    weight: z.number().int().min(100).max(900),
    align: z.enum(['left', 'center', 'right']),
    lineHeight: z.number().min(0.8).max(3),
    letterSpacing: z.number().min(-0.05).max(0.35),
    background: z.strictObject({
      mode: z.enum(['none', 'block', 'marker']),
      color,
      opacity: z.number().min(0).max(1),
      paddingX: z.number().min(0).max(2),
      paddingY: z.number().min(0).max(2),
      radius: z.number().min(0).max(2),
    }),
    outline: z.strictObject({
      enabled: z.boolean(),
      color,
      opacity: z.number().min(0).max(1),
      width: z.number().min(0).max(0.25),
    }),
    shadow: z.strictObject({
      enabled: z.boolean(),
      color,
      opacity: z.number().min(0).max(1),
      blur: z.number().min(0).max(1),
      x: z.number().min(-1).max(1),
      y: z.number().min(-1).max(1),
    }),
  })
  .refine(({ family, weight }) => {
    const { minWeight, maxWeight } = reviewTextTypefaces[family];
    return weight >= minWeight && weight <= maxWeight;
  });

export type ReviewTextAppearance = z.infer<typeof appearanceSchema>;

export function parseReviewTextAppearance(value: unknown): ReviewTextAppearance | null {
  const parsed = appearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const legacyReviewTextAppearance: ReviewTextAppearance = {
  version: 1,
  family: 'legacy',
  weight: 600,
  align: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,
  background: {
    mode: 'none',
    color: '#101218',
    opacity: 0.78,
    paddingX: 0.4,
    paddingY: 0.18,
    radius: 0.23,
  },
  outline: { enabled: true, color: '#000000', opacity: 0.65, width: 0.06 },
  shadow: { enabled: false, color: '#000000', opacity: 0.5, blur: 0.17, x: 0, y: 0.07 },
};

export function reviewTextCssColor(hex: string, opacity: number) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}
