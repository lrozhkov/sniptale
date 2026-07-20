export async function tryNativeCommitStep<TValue>(
  step: () => Promise<TValue>
): Promise<{ ok: true; value: TValue } | { ok: false }> {
  try {
    return { ok: true, value: await step() };
  } catch {
    return { ok: false };
  }
}

export async function runNativeBestEffort(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    // Native transfer is already committed; best-effort cleanup/UI failures must not drop ack.
  }
}
