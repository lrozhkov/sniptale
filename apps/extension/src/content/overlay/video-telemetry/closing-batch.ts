/** Sends a closed document's retained tail before its earlier acknowledgement can return. */
export function createClosingObservationDrain<T>(options: {
  inFlight(): T | null;
  takeNext(): T | null;
  isValid(value: unknown): value is T[];
  send(packets: T[]): Promise<void>;
}) {
  let retained: T[] | null = null;
  let pending: Promise<boolean> | null = null;
  return (): Promise<boolean> => {
    if (pending) return pending;
    try {
      if (retained === null) {
        retained = [];
        const previous = options.inFlight();
        if (previous) retained.push(structuredClone(previous));
        for (;;) {
          const next = options.takeNext();
          if (!next) break;
          retained.push(next);
        }
      }
      if (!retained.length) return Promise.resolve(true);
      if (!options.isValid(retained)) return Promise.resolve(false);
      // Invoke the native transport in the pagehide task, before its first async suspension.
      const sent = options.send(structuredClone(retained));
      const completion = sent
        .then(
          () => {
            retained = [];
            return true;
          },
          () => false
        )
        .finally(() => {
          if (pending === completion) pending = null;
        });
      pending = completion;
      return completion;
    } catch {
      return Promise.resolve(false);
    }
  };
}
