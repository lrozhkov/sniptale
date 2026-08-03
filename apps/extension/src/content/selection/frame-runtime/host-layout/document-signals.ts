import { isContentOwnedElement } from '../../../platform/dom-host';

type SignalElement = Element & { ownerDocument: Document };

export type HostLayoutInvalidationOptions = {
  motion?: boolean;
  viewportScroll?: boolean;
};

export type ExplicitMotionSignal = {
  family: 'animation' | 'transition';
  name: string;
  pseudoElement: string;
  target: SignalElement;
};

type DocumentSignalArgs = {
  beginExplicitMotion(signal: ExplicitMotionSignal): boolean | void;
  beginTransientMotion(target: SignalElement): boolean | void;
  continueExplicitMotion(signal: ExplicitMotionSignal): boolean | void;
  documentWillUnload(doc: Document): void;
  endExplicitMotion(signal: ExplicitMotionSignal): boolean | void;
  invalidate(options?: HostLayoutInvalidationOptions): void;
  registerAddedNode(node: Node): void;
  unregisterRemovedNode(node: Node): void;
};

type LayoutObservers = {
  intersection: IntersectionObserver | null;
  resize: ResizeObserver | null;
};

function isOwnedNode(node: Node) {
  return node.ownerDocument === document && isContentOwnedElement(node);
}

function asSignalElement(target: EventTarget | null): SignalElement | null {
  if (!target || !('nodeType' in target) || target.nodeType !== Node.ELEMENT_NODE) return null;
  return target as SignalElement;
}

function readExplicitMotionSignal(event: Event): ExplicitMotionSignal | null {
  const target = asSignalElement(event.target);
  if (!target) return null;
  const family = event.type.startsWith('transition') ? 'transition' : 'animation';
  const details = event as Event & {
    animationName?: string;
    propertyName?: string;
    pseudoElement?: string;
  };
  return {
    family,
    name: (family === 'transition' ? details.propertyName : details.animationName) ?? '',
    pseudoElement: details.pseudoElement ?? '',
    target,
  };
}

function registerDocumentEvents(args: DocumentSignalArgs, doc: Document, win: Window) {
  const invalidate = () => args.invalidate();
  const handleScroll = (event: Event) => {
    const target = event.target;
    if (target && 'nodeType' in target && isOwnedNode(target as Node)) return;
    args.invalidate({ viewportScroll: true });
  };
  const handleMotionStart = (event: Event) => {
    const signal = readExplicitMotionSignal(event);
    if (!signal || isOwnedNode(signal.target)) return;
    if (args.beginExplicitMotion(signal) !== false) args.invalidate({ motion: true });
  };
  const handleMotionIteration = (event: Event) => {
    const signal = readExplicitMotionSignal(event);
    if (!signal || isOwnedNode(signal.target)) return;
    if (args.continueExplicitMotion(signal) !== false) args.invalidate({ motion: true });
  };
  const handleMotionEnd = (event: Event) => {
    const signal = readExplicitMotionSignal(event);
    if (!signal || isOwnedNode(signal.target)) return;
    if (args.endExplicitMotion(signal) !== false) args.invalidate({ motion: true });
  };
  const handleDocumentWillUnload = () => args.documentWillUnload(doc);

  win.addEventListener('scroll', handleScroll, { passive: true });
  win.addEventListener('resize', invalidate);
  win.addEventListener('pagehide', handleDocumentWillUnload);
  win.addEventListener('pageshow', invalidate);
  win.addEventListener('beforeunload', handleDocumentWillUnload);
  doc.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  doc.addEventListener('transitionrun', handleMotionStart, true);
  doc.addEventListener('transitionend', handleMotionEnd, true);
  doc.addEventListener('transitioncancel', handleMotionEnd, true);
  doc.addEventListener('animationstart', handleMotionStart, true);
  doc.addEventListener('animationiteration', handleMotionIteration, true);
  doc.addEventListener('animationend', handleMotionEnd, true);
  doc.addEventListener('animationcancel', handleMotionEnd, true);

  return () => {
    win.removeEventListener('scroll', handleScroll);
    win.removeEventListener('resize', invalidate);
    win.removeEventListener('pagehide', handleDocumentWillUnload);
    win.removeEventListener('pageshow', invalidate);
    win.removeEventListener('beforeunload', handleDocumentWillUnload);
    doc.removeEventListener('scroll', handleScroll, { capture: true });
    doc.removeEventListener('transitionrun', handleMotionStart, true);
    doc.removeEventListener('transitionend', handleMotionEnd, true);
    doc.removeEventListener('transitioncancel', handleMotionEnd, true);
    doc.removeEventListener('animationstart', handleMotionStart, true);
    doc.removeEventListener('animationiteration', handleMotionIteration, true);
    doc.removeEventListener('animationend', handleMotionEnd, true);
    doc.removeEventListener('animationcancel', handleMotionEnd, true);
  };
}

function observeDocumentMutations(args: DocumentSignalArgs, doc: Document, win: Window) {
  const MutationObserverCtor = (win as unknown as { MutationObserver: typeof MutationObserver })
    .MutationObserver;
  const mutation = new MutationObserverCtor((records: MutationRecord[]) => {
    let actionable = false;
    let motion = false;
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => {
          if (isOwnedNode(node)) return;
          actionable = true;
          args.registerAddedNode(node);
        });
        record.removedNodes.forEach((node) => {
          if (isOwnedNode(node)) return;
          actionable = true;
          args.unregisterRemovedNode(node);
        });
        continue;
      }
      if (isOwnedNode(record.target)) continue;
      const target = asSignalElement(record.target);
      if (target && (record.attributeName === 'class' || record.attributeName === 'style')) {
        actionable = true;
        if (args.beginTransientMotion(target) !== false) {
          motion = true;
        }
        continue;
      }
      actionable = true;
    }
    if (actionable) args.invalidate(motion ? { motion: true } : undefined);
  });
  mutation.observe(doc.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  return mutation;
}

function createLayoutObservers(args: DocumentSignalArgs, win: Window): LayoutObservers {
  const ResizeObserverCtor = (win as unknown as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
  const IntersectionObserverCtor = (
    win as unknown as { IntersectionObserver?: typeof IntersectionObserver }
  ).IntersectionObserver;
  const invalidateResizedTargets = (entries: ReadonlyArray<{ target: Element }>) => {
    let actionable = false;
    let motion = false;
    entries.forEach((entry) => {
      const target = asSignalElement(entry.target);
      if (!target || isOwnedNode(target)) return;
      actionable = true;
      if (args.beginTransientMotion(target) !== false) {
        motion = true;
      }
    });
    if (actionable) args.invalidate(motion ? { motion: true } : undefined);
  };
  const invalidateIntersectedTargets = (entries: ReadonlyArray<{ target: Element }>) => {
    if (entries.some((entry) => !isOwnedNode(entry.target))) args.invalidate();
  };
  return {
    resize: ResizeObserverCtor
      ? new ResizeObserverCtor((entries) => invalidateResizedTargets(entries))
      : null,
    intersection: IntersectionObserverCtor
      ? new IntersectionObserverCtor((entries) => invalidateIntersectedTargets(entries))
      : null,
  };
}

function registerDocumentSignalSources(args: DocumentSignalArgs, doc: Document) {
  const win = doc.defaultView;
  if (!win || !doc.documentElement) return null;
  const removeEvents = registerDocumentEvents(args, doc, win);
  const mutation = observeDocumentMutations(args, doc, win);
  const observers = createLayoutObservers(args, win);
  return {
    observers,
    cleanup() {
      removeEvents();
      mutation.disconnect();
      observers.resize?.disconnect();
      observers.intersection?.disconnect();
    },
  };
}

export function createDocumentSignalRegistry(args: DocumentSignalArgs) {
  const cleanupByDocument = new Map<Document, () => void>();
  const observersByDocument = new Map<Document, LayoutObservers>();

  const unregisterDocument = (doc: Document) => {
    cleanupByDocument.get(doc)?.();
    cleanupByDocument.delete(doc);
    observersByDocument.delete(doc);
  };
  const registerDocument = (doc: Document) => {
    if (cleanupByDocument.has(doc)) return;
    const sources = registerDocumentSignalSources(args, doc);
    if (!sources) return;
    observersByDocument.set(doc, sources.observers);
    cleanupByDocument.set(doc, sources.cleanup);
  };

  return {
    dispose() {
      cleanupByDocument.forEach((cleanup) => cleanup());
      cleanupByDocument.clear();
      observersByDocument.clear();
    },
    observe(element: HTMLElement) {
      registerDocument(element.ownerDocument);
      const observers = observersByDocument.get(element.ownerDocument);
      observers?.resize?.observe(element);
      observers?.intersection?.observe(element);
    },
    registerDocument,
    unregisterDocument,
    unobserve(element: HTMLElement) {
      const observers = observersByDocument.get(element.ownerDocument);
      observers?.resize?.unobserve(element);
      observers?.intersection?.unobserve(element);
    },
  };
}
