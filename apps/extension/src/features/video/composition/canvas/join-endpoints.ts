import type { RenderResources } from './render-resources';

type JoinRequest = {
  key: object;
  outgoingTime: number;
  incomingTime: number;
  incomingWeight: number;
  sampling?: 'cut';
};
type Endpoint = { canvas: HTMLCanvasElement; release(): void };
type EndpointPair = {
  key: object;
  outgoingTime: number;
  incomingTime: number;
  outgoing: Endpoint;
  incoming: Endpoint;
};
type BorrowedEndpoints = {
  outgoing: HTMLCanvasElement;
  incoming: HTMLCanvasElement;
  incomingWeight: number;
  sampling: 'cut' | undefined;
};

/** Owns immutable endpoint samples or copies; the adapter retains decoder and clock authority. */
export function createCompositionJoinEndpoints(params: {
  resources: RenderResources;
  size: { width: number; height: number };
  /** retained transfers an immutable source lease to this owner until release. */
  renderSample(
    time: number,
    signal: AbortSignal
  ): Promise<
    | { canvas: CanvasImageSource; release(): void; retained?: false }
    | { canvas: HTMLCanvasElement; release(): void; retained: true }
  >;
  /** Optional completed-frame compositor; false permits the existing Canvas hardware fallback. */
  compose?(args: {
    context: CanvasRenderingContext2D;
    outgoing: HTMLCanvasElement;
    incoming: HTMLCanvasElement;
    incomingWeight: number;
    sampling: 'cut' | undefined;
    signal: AbortSignal;
  }): Promise<boolean>;
}) {
  let generation = 0;
  let disposed = false;
  let busy = false;
  let pair: EndpointPair | null = null;
  let borrowed: EndpointPair | null = null;
  const releasePair = (endpoints: EndpointPair) => {
    endpoints.outgoing.release();
    endpoints.incoming.release();
  };
  const clear = () => {
    generation++;
    if (pair && pair !== borrowed) releasePair(pair);
    pair = null;
  };
  const assertLive = (signal: AbortSignal, revision: number) => {
    signal.throwIfAborted();
    if (disposed || revision !== generation)
      throw new DOMException('Composition sampling was cancelled.', 'AbortError');
  };
  const copy = async (time: number, role: string, signal: AbortSignal, revision: number) => {
    assertLive(signal, revision);
    const sample = await params.renderSample(time, signal);
    let output: Endpoint | undefined;
    let retained = false;
    try {
      assertLive(signal, revision);
      if (sample.retained) {
        retained = true;
        return sample;
      }
      const copy = params.resources.canvas(role, params.size);
      output = copy;
      copy.context.drawImage(sample.canvas, 0, 0);
      return copy;
    } catch (error) {
      output?.release();
      throw error;
    } finally {
      if (!retained) sample.release();
    }
  };
  // Admission and pair retirement cover both Canvas drawing and asynchronous GPU consumption.
  const withEndpoints = async <T>(
    request: JoinRequest,
    signal: AbortSignal,
    consume: (endpoints: BorrowedEndpoints) => Promise<T>
  ): Promise<T> => {
    signal.throwIfAborted();
    if (disposed) throw new Error('Composition endpoint owner is disposed.');
    if (busy) throw new Error('Composition endpoints are already being sampled.');
    const { key, outgoingTime, incomingTime, incomingWeight } = request;
    busy = true;
    try {
      if (
        !pair ||
        pair.key !== key ||
        pair.outgoingTime !== outgoingTime ||
        pair.incomingTime !== incomingTime
      ) {
        clear();
        const revision = generation;
        const outgoing = await copy(outgoingTime, 'composition-join-outgoing', signal, revision);
        let incoming: Endpoint | undefined;
        try {
          incoming = await copy(incomingTime, 'composition-join-incoming', signal, revision);
          assertLive(signal, revision);
          pair = { key, outgoingTime, incomingTime, outgoing, incoming };
        } catch (error) {
          outgoing.release();
          incoming?.release();
          throw error;
        }
      }
      const revision = generation;
      assertLive(signal, revision);
      const current = pair;
      borrowed = current;
      const result = await consume({
        outgoing: current.outgoing.canvas,
        incoming: current.incoming.canvas,
        incomingWeight,
        sampling: request.sampling,
      });
      assertLive(signal, revision);
      return result;
    } catch (error) {
      clear();
      throw error;
    } finally {
      if (borrowed && borrowed !== pair) releasePair(borrowed);
      borrowed = null;
      busy = false;
    }
  };
  return {
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
    /**
     * Borrows one immutable pair until consume settles; sources must not escape the callback.
     * Clear invalidates publication, not source lifetime. The caller owns any callback output,
     * including output completed before cancellation rejects this transaction.
     */
    withEndpoints,
    async draw(context: CanvasRenderingContext2D, request: JoinRequest, signal: AbortSignal) {
      return withEndpoints(request, signal, async (endpoints) => {
        const revision = generation;
        if (params.compose && (await params.compose({ context, ...endpoints, signal }))) {
          assertLive(signal, revision);
          return;
        }
        assertLive(signal, revision);
        const { incomingWeight } = endpoints;
        context.save();
        try {
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, params.size.width, params.size.height);
          context.filter = 'none';
          context.shadowColor = 'transparent';
          context.shadowBlur = 0;
          context.shadowOffsetX = context.shadowOffsetY = 0;
          context.globalCompositeOperation = 'source-over';
          context.globalAlpha = request.sampling === 'cut' ? 1 : 1 - incomingWeight;
          context.drawImage(endpoints.outgoing, 0, 0);
          // Gallery cuts retain source-over decoration. Bookends mix premultiplied contributions.
          context.globalCompositeOperation = request.sampling === 'cut' ? 'source-over' : 'lighter';
          context.globalAlpha = incomingWeight;
          context.drawImage(endpoints.incoming, 0, 0);
        } finally {
          context.restore();
        }
      });
    },
  };
}
