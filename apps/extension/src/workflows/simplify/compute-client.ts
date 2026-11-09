import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  SimplifyComputeRegion,
  RuntimeSimplifyRequestByType,
} from '../../contracts/messaging/contracts/runtime-message/simplify.types';
import {
  parseDrawingSimplifySnapshot,
  type DrawingSimplifySnapshot,
} from '../../features/drawing/public';
import { parseSimplifySettings, type SimplifySettings } from '../../features/simplify/settings';

export type SimplifyComputeRequest =
  RuntimeSimplifyRequestByType[typeof MessageType.SIMPLIFY_COMMAND];
type SimplifyComputedSnapshot = DrawingSimplifySnapshot & { readonly version: string };
interface SimplifyComputeInput {
  readonly source: DrawingSimplifySnapshot;
  readonly region: SimplifyComputeRegion;
  readonly settings: SimplifySettings;
}
interface SimplifyComputeClient {
  render(input: SimplifyComputeInput): Promise<SimplifyComputedSnapshot>;
  cancel(): void;
  dispose(): void;
}
export interface SimplifyComputeDependencies {
  send(request: SimplifyComputeRequest): Promise<unknown>;
}
interface PreparedSession {
  readonly id: string;
  readonly source: DrawingSimplifySnapshot;
}
function aborted(): DOMException {
  return new DOMException('Simplify operation was cancelled.', 'AbortError');
}
function failed(): Error {
  return new Error('Simplify computation failed.');
}
function validRegion(region: SimplifyComputeRegion, source: DrawingSimplifySnapshot): boolean {
  return (
    [region.x, region.y, region.width, region.height].every(Number.isSafeInteger) &&
    (region.rotation === undefined || Number.isFinite(region.rotation)) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= source.width &&
    region.y + region.height <= source.height
  );
}
function prepareResponse(value: unknown, source: DrawingSimplifySnapshot): PreparedSession | null {
  if (!isPlainRecord(value) || value['success'] !== true) return null;
  const id = value['sessionId'];
  if (
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
    value['width'] !== source.width ||
    value['height'] !== source.height ||
    typeof value['version'] !== 'string' ||
    value['version'].length > 128
  )
    return null;
  return { id, source };
}
function renderResponse(
  value: unknown,
  session: PreparedSession,
  region: SimplifyComputeRegion
): SimplifyComputedSnapshot | null {
  if (
    !isPlainRecord(value) ||
    value['success'] !== true ||
    value['sessionId'] !== session.id ||
    typeof value['version'] !== 'string' ||
    value['version'].length > 128 ||
    value['width'] !== region.width ||
    value['height'] !== region.height
  )
    return null;
  const snapshot = parseDrawingSimplifySnapshot(value);
  return snapshot ? { ...snapshot, version: value['version'] } : null;
}

/** Owns one caller's disposable compute cache; runtime adapters own accepted objects and sources. */
export function createSimplifyComputeClient(
  deps: SimplifyComputeDependencies
): SimplifyComputeClient {
  let generation = 0;
  let session: PreparedSession | null = null;
  let pending = false;
  let disposed = false;
  const release = (id: string, operation: 'cancel' | 'dispose') => {
    void deps
      .send({ type: MessageType.SIMPLIFY_COMMAND, operation, sessionId: id })
      .catch(() => undefined);
  };
  const cancel = () => {
    generation += 1;
    pending = false;
    if (session) release(session.id, 'cancel');
    session = null;
  };
  return {
    async render(input) {
      if (disposed) throw aborted();
      if (pending) cancel();
      const ownGeneration = ++generation;
      const current = () => !disposed && generation === ownGeneration;
      const settings = parseSimplifySettings(input.settings);
      const cached = session?.source;
      const source =
        cached &&
        cached.dataUrl === input.source.dataUrl &&
        cached.width === input.source.width &&
        cached.height === input.source.height
          ? cached
          : parseDrawingSimplifySnapshot(input.source);
      if (!source || !settings || !validRegion(input.region, source)) throw failed();
      pending = true;
      try {
        if (!session || session.source.dataUrl !== source.dataUrl) {
          if (session) release(session.id, 'dispose');
          session = null;
          const response = await deps.send({
            type: MessageType.SIMPLIFY_COMMAND,
            operation: 'prepare',
            dataUrl: source.dataUrl,
          });
          const prepared = prepareResponse(response, source);
          if (!current()) {
            if (prepared) release(prepared.id, 'dispose');
            throw aborted();
          }
          if (!prepared) throw failed();
          session = prepared;
        }
        const active = session;
        const response = await deps.send({
          type: MessageType.SIMPLIFY_COMMAND,
          operation: 'render',
          sessionId: active.id,
          region: input.region,
          settings,
        });
        if (!current()) throw aborted();
        const result = renderResponse(response, active, input.region);
        if (!result) throw failed();
        return result;
      } catch (error) {
        if (!current()) throw aborted();
        if (session) release(session.id, 'dispose');
        session = null;
        throw error;
      } finally {
        if (current()) pending = false;
      }
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
    },
  };
}
