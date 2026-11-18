/** One retry packet is retained until its transport acknowledges it. */
export function createObservationDelivery<Packet>(args: {
  takeNext(): Packet | null;
  send(packet: Packet): Promise<void>;
  hasPending(): boolean;
  beforeDrain?(): Promise<void>;
  packetBarrier?(): Promise<void>;
}) {
  let inFlight: Packet | null = null;
  let running: Promise<boolean> | null = null;

  function pump(): Promise<boolean> {
    if (running) return running;
    const work = (async () => {
      if (args.beforeDrain) await args.beforeDrain();
      try {
        for (;;) {
          if (args.packetBarrier) {
            let barrier: Promise<void>;
            do {
              barrier = args.packetBarrier();
              await barrier;
            } while (barrier !== args.packetBarrier());
          }
          inFlight ??= args.takeNext();
          if (!inFlight) return true;
          await args.send(structuredClone(inFlight));
          inFlight = null;
        }
      } catch {
        return false;
      }
    })();
    const completion = work.then((drained) => {
      if (running !== completion) return drained;
      running = null;
      // Also drain input accepted after the empty-queue check.
      return drained && args.hasPending() ? pump() : drained;
    });
    running = completion;
    return completion;
  }

  return { pump, inFlight: () => inFlight };
}
