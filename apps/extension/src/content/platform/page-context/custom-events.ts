export type ContentCustomEventTarget = Pick<
  EventTarget,
  'addEventListener' | 'dispatchEvent' | 'removeEventListener'
>;

const contentCustomEventTarget = new EventTarget();
const DEFAULT_MAX_CUSTOM_EVENT_DETAIL_BYTES = 16 * 1024;

type ContentCustomDetailParser<T> = (detail: unknown) => T | null;

interface ContentCustomDetailListenerOptions<T> {
  maxSerializedDetailBytes?: number;
  parseDetail?: ContentCustomDetailParser<T>;
}

function resolveContentCustomEventTarget(
  target?: ContentCustomEventTarget
): ContentCustomEventTarget {
  return target ?? contentCustomEventTarget;
}

export function dispatchContentCustomDetailEvent<T>(
  name: string,
  detail: T,
  target?: ContentCustomEventTarget
): void {
  resolveContentCustomEventTarget(target).dispatchEvent(new CustomEvent(name, { detail }));
}

export function dispatchContentCustomSignalEvent(
  name: string,
  target?: ContentCustomEventTarget
): void {
  resolveContentCustomEventTarget(target).dispatchEvent(new CustomEvent(name));
}

function getSerializedDetailBytes(detail: unknown): number {
  try {
    const serialized = JSON.stringify(detail);
    if (typeof serialized !== 'string') {
      return 0;
    }

    return new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function parseCustomEventDetail<T>(
  detail: unknown,
  options: ContentCustomDetailListenerOptions<T>
): T | null {
  if (detail === null || detail === undefined) {
    return null;
  }

  const maxBytes = options.maxSerializedDetailBytes ?? DEFAULT_MAX_CUSTOM_EVENT_DETAIL_BYTES;
  if (getSerializedDetailBytes(detail) > maxBytes) {
    return null;
  }

  if (options.parseDetail) {
    return options.parseDetail(detail);
  }

  return detail as T;
}

export function addContentCustomDetailEventListener<T>(
  name: string,
  listener: (detail: T) => void,
  target?: ContentCustomEventTarget,
  options: ContentCustomDetailListenerOptions<T> = {}
): () => void {
  const eventTarget = resolveContentCustomEventTarget(target);
  const wrappedListener = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const parsedDetail = parseCustomEventDetail(event.detail, options);
    if (!parsedDetail) {
      return;
    }

    listener(parsedDetail);
  };

  eventTarget.addEventListener(name, wrappedListener as EventListener);
  return () => {
    eventTarget.removeEventListener(name, wrappedListener as EventListener);
  };
}

export function addContentCustomSignalEventListener(
  name: string,
  listener: () => void,
  target?: ContentCustomEventTarget
): () => void {
  const eventTarget = resolveContentCustomEventTarget(target);
  const wrappedListener = () => {
    listener();
  };

  eventTarget.addEventListener(name, wrappedListener as EventListener);
  return () => {
    eventTarget.removeEventListener(name, wrappedListener as EventListener);
  };
}
