const NATIVE_INVOCATION_TTL_MS = 5 * 60_000;
const NATIVE_INVOCATION_MAX_ENTRIES = 512;

export class NativeInvocationReplayGuard {
  private readonly consumed = new Map<string, number>();

  consume(
    message: {
      controllerLeaseId: string;
      invocationId: string;
      requestedAtEpochMs: number;
    },
    warn: (message: string) => void
  ): boolean {
    const now = Date.now();
    this.prune(now);
    if (Math.abs(now - message.requestedAtEpochMs) > NATIVE_INVOCATION_TTL_MS) {
      warn('Stale native invocation');
      return false;
    }
    const key = `${message.controllerLeaseId}:${message.invocationId}`;
    if (this.consumed.has(key)) {
      warn('Replay native invocation');
      return false;
    }
    this.consumed.set(key, now);
    return true;
  }

  reset(): void {
    this.consumed.clear();
  }

  private prune(now: number): void {
    for (const [key, createdAt] of this.consumed) {
      if (now - createdAt > NATIVE_INVOCATION_TTL_MS) {
        this.consumed.delete(key);
      }
    }
    while (this.consumed.size > NATIVE_INVOCATION_MAX_ENTRIES) {
      const oldestKey = this.consumed.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      this.consumed.delete(oldestKey);
    }
  }
}
