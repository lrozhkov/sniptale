import {
  createDrawingSession,
  findDrawingObjectsIntersectingPath,
  type DrawingDocumentCommit,
  type DrawingPoint,
} from '../../../../features/drawing/public';
import {
  createContentDrawingController,
  type ContentDrawingController,
} from '../../../drawing/controller';
import {
  createRecordingDrawingClockDriver,
  type RecordingDrawingClockPort,
} from './dom-driver/drawing-clock';

export const RECORDING_DRAWING_AUTO_HIDE_DELAYS = [0, 3, 5, 10, 30] as const;
export type RecordingDrawingAutoHideDelay = (typeof RECORDING_DRAWING_AUTO_HIDE_DELAYS)[number];

type Expiry = {
  fadeHandle: ReturnType<typeof setTimeout> | null;
  handle: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  startedAt: number | null;
};

export interface RecordingDrawingOwner {
  readonly controller: ContentDrawingController;
  erasePath(path: readonly DrawingPoint[], tolerance?: number): void;
  getAutoHideDelay(): RecordingDrawingAutoHideDelay;
  getVisualRevision(): number;
  getVisualOpacity(objectId: string): number;
  subscribeVisualChanges(listener: () => void): () => void;
  setAutoHideDelay(delay: RecordingDrawingAutoHideDelay): void;
  setClockRunning(running: boolean): void;
  dispose(): void;
}

/**
 * Owns disposable recording drawings and their recording-time expiry clock. Tool preferences stay
 * in the shared drawing controller; no page-preparation history or persistence owner is reused.
 */
export function createRecordingDrawingOwner(options?: {
  clock?: RecordingDrawingClockPort;
  initialAutoHideDelay?: RecordingDrawingAutoHideDelay;
}): RecordingDrawingOwner {
  const clock = options?.clock ?? createRecordingDrawingClockDriver();
  const expiries = new Map<string, Expiry>();
  const visualListeners = new Set<() => void>();
  let autoHideDelay = options?.initialAutoHideDelay ?? 0;
  let visualRevision = 0;
  let clockRunning = false;
  let disposed = false;
  let controller: ContentDrawingController;

  const cancelExpiry = (objectId: string) => {
    const expiry = expiries.get(objectId);
    if (expiry?.handle) clock.clearTimeout(expiry.handle);
    if (expiry?.fadeHandle) clock.clearTimeout(expiry.fadeHandle);
    expiries.delete(objectId);
    visualRevision += 1;
    visualListeners.forEach((listener) => listener());
  };
  const expire = (objectId: string, expected: Expiry) => {
    if (disposed || expiries.get(objectId) !== expected) return;
    expiries.delete(objectId);
    controller.session.deleteObjects([objectId]);
  };
  const startExpiry = (objectId: string, expiry: Expiry) => {
    if (!clockRunning || expiry.remainingMs <= 0) return;
    expiry.startedAt = clock.now();
    expiry.handle = clock.setTimeout(() => expire(objectId, expiry), expiry.remainingMs);
    const animate = () => {
      if (!clockRunning || disposed || expiries.get(objectId) !== expiry) return;
      visualRevision += 1;
      visualListeners.forEach((listener) => listener());
      const elapsed = expiry.startedAt === null ? 0 : clock.now() - expiry.startedAt;
      if (expiry.remainingMs - elapsed > 0) {
        expiry.fadeHandle = clock.setTimeout(animate, 50);
      }
    };
    expiry.fadeHandle = clock.setTimeout(animate, Math.max(0, expiry.remainingMs - 300));
  };
  const scheduleExpiry = (objectId: string) => {
    cancelExpiry(objectId);
    if (autoHideDelay === 0) return;
    const expiry: Expiry = {
      fadeHandle: null,
      handle: null,
      remainingMs: autoHideDelay * 1000,
      startedAt: null,
    };
    expiries.set(objectId, expiry);
    startExpiry(objectId, expiry);
  };
  const acceptCommit = (commit: DrawingDocumentCommit) => {
    const before = new Map(commit.before.objects.map((object) => [object.id, object]));
    const afterIds = new Set(commit.after.objects.map((object) => object.id));
    for (const object of commit.after.objects) {
      if (before.get(object.id) !== object) scheduleExpiry(object.id);
    }
    for (const objectId of before.keys()) {
      if (!afterIds.has(objectId)) cancelExpiry(objectId);
    }
    return true;
  };

  controller = createContentDrawingController(
    createDrawingSession({ onDocumentCommit: acceptCommit })
  );

  return {
    controller,
    erasePath(path, tolerance) {
      const touched = findDrawingObjectsIntersectingPath(
        controller.session.getSnapshot().document.objects,
        path,
        tolerance
      );
      controller.session.deleteObjects(touched.map((object) => object.id));
    },
    getAutoHideDelay: () => autoHideDelay,
    getVisualRevision: () => visualRevision,
    getVisualOpacity(objectId) {
      const expiry = expiries.get(objectId);
      if (!expiry) return 1;
      const elapsed =
        clockRunning && expiry.startedAt !== null ? clock.now() - expiry.startedAt : 0;
      return Math.max(0, Math.min(1, (expiry.remainingMs - elapsed) / 300));
    },
    subscribeVisualChanges(listener) {
      visualListeners.add(listener);
      return () => visualListeners.delete(listener);
    },
    setAutoHideDelay(delay) {
      autoHideDelay = delay;
    },
    setClockRunning(running) {
      if (clockRunning === running || disposed) return;
      clockRunning = running;
      for (const [objectId, expiry] of expiries) {
        if (running) {
          if (expiry.remainingMs <= 0) expire(objectId, expiry);
          else startExpiry(objectId, expiry);
          continue;
        }
        if (expiry.handle) clock.clearTimeout(expiry.handle);
        if (expiry.fadeHandle) clock.clearTimeout(expiry.fadeHandle);
        if (expiry.startedAt !== null) {
          expiry.remainingMs = Math.max(0, expiry.remainingMs - (clock.now() - expiry.startedAt));
        }
        expiry.handle = null;
        expiry.fadeHandle = null;
        expiry.startedAt = null;
        visualRevision += 1;
        visualListeners.forEach((listener) => listener());
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const objectId of [...expiries.keys()]) cancelExpiry(objectId);
      controller.session.dispose();
      visualListeners.clear();
    },
  };
}
