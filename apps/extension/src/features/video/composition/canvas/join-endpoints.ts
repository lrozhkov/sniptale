import type { RenderCanvasLease, RenderResources } from './render-resources';

/** Owns two immutable complete-frame copies; the adapter retains its decoder and clock authority. */
export function createCompositionJoinEndpoints(params: {
  resources: RenderResources;
  size: { width: number; height: number };
  renderSample(
    time: number,
    signal: AbortSignal
  ): Promise<{ canvas: CanvasImageSource; release(): void }>;
}) {
  let generation = 0;
  let disposed = false;
  let busy = false;
  let pair: {
    key: object;
    outgoingTime: number;
    incomingTime: number;
    outgoing: RenderCanvasLease;
    incoming: RenderCanvasLease;
  } | null = null;
  const clear = () => {
    generation++;
    pair?.outgoing.release();
    pair?.incoming.release();
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
    let output: RenderCanvasLease | undefined;
    try {
      assertLive(signal, revision);
      output = params.resources.canvas(role, params.size);
      output.context.drawImage(sample.canvas, 0, 0);
      return output;
    } catch (error) {
      output?.release();
      throw error;
    } finally {
      sample.release();
    }
  };
  return {
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
    async draw(
      context: CanvasRenderingContext2D,
      request: {
        key: object;
        outgoingTime: number;
        incomingTime: number;
        incomingWeight: number;
        sampling?: 'cut';
      },
      signal: AbortSignal
    ) {
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
          let incoming: RenderCanvasLease | undefined;
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
        assertLive(signal, generation);
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
          context.drawImage(pair.outgoing.canvas, 0, 0);
          // Gallery cuts retain source-over decoration. Bookends mix premultiplied contributions.
          context.globalCompositeOperation = request.sampling === 'cut' ? 'source-over' : 'lighter';
          context.globalAlpha = incomingWeight;
          context.drawImage(pair.incoming.canvas, 0, 0);
        } finally {
          context.restore();
        }
      } catch (error) {
        clear();
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
