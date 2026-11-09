import { z } from 'zod';

export const DESIGN_REVIEW_SESSION_PORT = 'sniptale-design-review-session-v1';
export const DESIGN_REVIEW_SESSION_MAX_BYTES = 16 * 1024 * 1024;
const id = z.string().uuid();
const payload = z
  .string()
  .max(DESIGN_REVIEW_SESSION_MAX_BYTES)
  .refine((value) => new TextEncoder().encode(value).byteLength <= DESIGN_REVIEW_SESSION_MAX_BYTES);
const mutation = {
  requestId: id,
  lease: id,
  expectedRevision: z.number().int().nonnegative().safe(),
};
const request = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open'), requestId: id }).strict(),
  z.object({ kind: z.enum(['save', 'clear']), ...mutation, payload }).strict(),
  z.object({ kind: z.literal('resume'), ...mutation }).strict(),
]);
const reply = z
  .object({
    requestId: id,
    status: z.enum(['ready', 'stale', 'refused', 'failed']),
    lease: id.nullable(),
    sessionId: id.nullable().optional(),
    revision: z.number().int().nonnegative().safe(),
    available: z.boolean(),
    payload: payload.optional(),
  })
  .strict();
export type DesignReviewSessionRequest = z.infer<typeof request>;
export type DesignReviewSessionReply = z.infer<typeof reply>;

/** The content owner validates semantics; this boundary admits bounded opaque UTF-8 data. */
export function isDesignReviewSessionPayload(value: unknown): value is string {
  return payload.safeParse(value).success;
}
export function parseDesignReviewSessionRequest(value: unknown): DesignReviewSessionRequest | null {
  const parsed = request.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parseDesignReviewSessionReply(value: unknown): DesignReviewSessionReply | null {
  const parsed = reply.safeParse(value);
  return parsed.success ? parsed.data : null;
}
