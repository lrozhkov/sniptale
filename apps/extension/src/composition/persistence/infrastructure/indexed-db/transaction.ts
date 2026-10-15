export async function abortIndexedDbMutation(
  transaction: { abort(): void; done: Promise<unknown> },
  error: unknown
): Promise<never> {
  try {
    transaction.abort();
  } catch {
    /* The transaction may already have aborted. */
  }
  await transaction.done.catch(() => undefined);
  throw error;
}
