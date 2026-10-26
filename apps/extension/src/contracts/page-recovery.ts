import { z } from 'zod';

export const PAGE_RECOVERY_CONTENT_PORT = 'sniptale-page-recovery-v1';
export const PAGE_RECOVERY_TTL_MS = 45 * 60 * 1000;
export const PAGE_RECOVERY_MAX_BYTES = 16 * 1024 * 1024;

const id = z.string().uuid();
const payload = z
  .string()
  .min(1)
  .max(PAGE_RECOVERY_MAX_BYTES)
  .refine((value) => new TextEncoder().encode(value).byteLength <= PAGE_RECOVERY_MAX_BYTES);
const mutation = { requestId: id, lease: id };
const request = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('peek'), requestId: id }).strict(),
  z.object({ kind: z.literal('load'), ...mutation }).strict(),
  z
    .object({
      kind: z.enum(['save', 'save-final']),
      ...mutation,
      payload,
      changedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ kind: z.literal('discard'), ...mutation }).strict(),
]);
const reply = z
  .object({
    kind: z.literal('result'),
    requestId: id,
    status: z.enum(['ready', 'refused', 'failed']),
    lease: id.nullable(),
    available: z.boolean(),
    payload: payload.optional(),
  })
  .strict();
export type PageRecoveryRequest = z.infer<typeof request>;
export type PageRecoveryReply = z.infer<typeof reply>;

/** Admits only bounded opaque data; the content history owner validates its semantic format. */
export function isPageRecoveryPayload(value: unknown): value is string {
  return payload.safeParse(value).success;
}
export function parsePageRecoveryRequest(value: unknown): PageRecoveryRequest | null {
  const parsed = request.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function parsePageRecoveryReply(value: unknown): PageRecoveryReply | null {
  const parsed = reply.safeParse(value);
  return parsed.success ? parsed.data : null;
}
