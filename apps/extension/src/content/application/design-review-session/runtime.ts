import {
  ReviewSessionDocumentController,
  type ReviewSessionDocument,
  type ReviewSessionEntry,
} from './controller';
import type {
  BrowserAnnotationSessionSnapshot,
  BrowserDomAnnotationRecord,
} from '../../parser/page-preparation/annotations';
import type {
  DesignReviewSessionReply,
  DesignReviewSessionRequest,
} from '../../../contracts/design-review-session';
import type { ContentPrivilegedActionIntentSource } from '../privileged-action-intent';
import { ReviewSessionPersistence } from './persistence';
export type { ReviewSessionEntry, ReviewSessionPreview } from './controller';

interface RuntimePorts {
  request(message: DesignReviewSessionRequest): Promise<DesignReviewSessionReply>;
  connected?(): boolean;
  annotations: {
    captureSnapshot(): BrowserAnnotationSessionSnapshot;
    applySnapshot(value: BrowserAnnotationSessionSnapshot): void;
    resetForDocument(): void;
    rebindTargets(resolve: (record: BrowserDomAnnotationRecord) => Element | null): void;
    getLiveTarget(id: number): Element | null;
    getRecoveryTarget?(id: number): Element | null;
    subscribe(listener: () => void): () => void;
  };
  pageUrl(): string;
  pageTitle?(): string;
  resolve(record: BrowserDomAnnotationRecord): Element | null;
  openTarget(target: Element): boolean;
  restoreTarget?(record: BrowserDomAnnotationRecord, target: Element): void;
  navigate(url: string): void;
  removeTarget(target: Element): void;
  clearTargets(): Promise<void>;
  capture(
    entry: ReviewSessionEntry,
    source: ContentPrivilegedActionIntentSource
  ): Promise<import('./controller').ReviewSessionPreview | null>;
  restoreMode(value: ReviewSessionDocument): void;
}
export interface ReviewSessionState {
  revision: number;
  active: boolean;
  records: ReviewSessionEntry[];
  panelOpen: boolean;
  position: { x: number; y: number };
  available: boolean;
  error: boolean;
  pending: boolean;
  canUndo: boolean;
}

/** Coordinates the current page projection, authored mutations, and saved preview capture. */
class ReviewSessionRuntimeOwner {
  private readonly controller = new ReviewSessionDocumentController();
  private readonly listeners = new Set<() => void>();
  private readonly persistence: ReviewSessionPersistence;
  private applying = false;
  private disposed = false;
  private leaving = false;
  private currentPage: string;
  private capturing = false;
  private readonly captured = new Map<string, string>();
  private snapshot: ReviewSessionState = {
    revision: 0,
    active: false,
    records: [],
    panelOpen: false,
    position: { x: 24, y: 72 },
    available: false,
    error: false,
    pending: false,
    canUndo: false,
  };
  constructor(private readonly ports: RuntimePorts) {
    this.currentPage = ports.pageUrl();
    this.persistence = new ReviewSessionPersistence({
      request: (message) => ports.request(message),
      connected: () => ports.connected?.(),
      serialize: () => JSON.stringify(this.controller.document),
      hasAuthoredEntries: () => this.controller.document.entries.length > 0,
      restorePayload: (payload, rememberPreviews) => this.restorePayload(payload, rememberPreviews),
      applyAdmission: (kind, adopted) => this.applyAdmission(kind, adopted),
      publish: (update) => this.publish(update),
      disposed: () => this.disposed,
    });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  open = () => this.persistence.open();
  retry = () => this.persistence.retry();
  resume = () => this.persistence.resume();
  flush = () => this.persistence.flush();
  private restorePayload(payload: string, rememberPreviews: boolean): boolean {
    if (!this.controller.restore(payload)) return false;
    if (rememberPreviews)
      for (const entry of this.controller.document.entries)
        if (entry.preview) this.captured.set(entry.id, JSON.stringify(entry.record));
    return true;
  }
  private applyAdmission(kind: 'open' | 'resume' | 'reconnect', adopted: boolean) {
    if (kind === 'resume')
      this.controller.document = { ...this.controller.document, enabled: true };
    if (kind === 'reconnect' && !adopted) return;
    if (kind === 'open' && !this.controller.document.enabled) return;
    this.restorePage();
    this.restoreMode();
    if (kind === 'open') {
      const pending = this.controller.document.pendingTarget;
      if (pending) void this.openRecord(pending).catch(() => undefined);
    }
  }
  private publish(update: Partial<ReviewSessionState> = {}) {
    if (this.disposed) return;
    const document = this.controller.document;
    this.snapshot = {
      ...this.snapshot,
      revision: this.snapshot.revision + 1,
      active: document.enabled,
      records: document.entries.map((entry) => ({
        ...entry,
        unavailable:
          entry.record.evidence.pageUrl !== this.ports.pageUrl() ||
          !this.ports.resolve(entry.record),
      })),
      panelOpen: document.panelOpen,
      position: document.position,
      canUndo: this.controller.canUndo,
      ...update,
    };
    this.listeners.forEach((listener) => listener());
  }
  private restorePage(resetMarkers = false) {
    this.applying = true;
    try {
      this.currentPage = this.ports.pageUrl();
      const existing = this.ports.annotations.captureSnapshot();
      if (resetMarkers) existing.nextMarkerNumber = 1;
      const { snapshot, records } = this.controller.projectPage(this.currentPage, existing);
      this.ports.annotations.resetForDocument();
      this.ports.annotations.applySnapshot(snapshot);
      this.ports.annotations.rebindTargets(this.ports.resolve);
      for (const record of records) {
        const target = this.ports.resolve(record);
        if (target) this.ports.restoreTarget?.(record, target);
      }
    } finally {
      this.applying = false;
    }
    this.publish();
  }
  private restoreMode() {
    const previous = this.applying;
    this.applying = true;
    try {
      this.ports.restoreMode(this.controller.document);
    } finally {
      this.applying = previous;
    }
  }
  setMode = (enabled: boolean, tool: ReviewSessionDocument['tool']) => {
    if (this.applying || this.leaving) return;
    if (this.controller.document.enabled === enabled && this.controller.document.tool === tool)
      return;
    if (this.persistence.isOpened && enabled && !this.controller.document.enabled)
      this.restorePage();
    this.controller.document = { ...this.controller.document, enabled, tool };
    if (enabled)
      this.controller.sync(
        this.currentPage,
        this.ports.annotations.captureSnapshot(),
        undefined,
        this.ports.pageTitle?.()
      );
    this.publish();
    void this.persistence.persist().catch(() => undefined);
  };
  setPanelOpen = (panelOpen: boolean) => {
    this.controller.document = { ...this.controller.document, panelOpen };
    this.publish();
    void this.persistence.persist().catch(() => undefined);
  };
  setPosition = (position: { x: number; y: number }) => {
    this.controller.document = { ...this.controller.document, position };
    this.publish();
    void this.persistence.persist().catch(() => undefined);
  };
  changed = () => {
    if (
      this.applying ||
      this.leaving ||
      !this.controller.document.enabled ||
      this.currentPage !== this.ports.pageUrl()
    )
      return;
    const local = this.ports.annotations.captureSnapshot();
    const currentIds = new Set(
      local.domRecords
        .filter(
          (record) =>
            record.comment || record.designReview?.action || record.propertyChanges.length > 0
        )
        .map((record) => record.annotationId)
    );
    const removedIds = new Set(
      this.controller.document.entries
        .filter(
          (entry) =>
            entry.record.evidence.pageUrl === this.currentPage &&
            !currentIds.has(entry.record.annotationId) &&
            this.ports.annotations.getRecoveryTarget?.(entry.record.annotationId)
        )
        .map((entry) => entry.record.annotationId)
    );
    if (!this.controller.sync(this.currentPage, local, removedIds, this.ports.pageTitle?.()))
      return;
    this.publish();
    void this.persistence.persist().catch(() => undefined);
  };
  beginNavigation = () => {
    this.changed();
    this.leaving = true;
    void this.flush().catch(() => undefined);
  };
  cancelNavigation = () => {
    this.leaving = false;
    this.publish();
  };
  navigatePage = () => {
    this.leaving = false;
    if (!this.controller.document.enabled) return;
    this.restorePage();
    this.restoreMode();
    const pending = this.controller.document.pendingTarget;
    if (pending) void this.openRecord(pending).catch(() => undefined);
  };
  openRecord = async (id: string) => {
    const entry = this.controller.document.entries.find((item) => item.id === id);
    if (!entry) return false;
    if (entry.record.evidence.pageUrl !== this.ports.pageUrl()) {
      const url = new URL(entry.record.evidence.pageUrl);
      if (!['https:', 'http:'].includes(url.protocol)) return false;
      this.controller.document = {
        ...this.controller.document,
        tool: 'navigate',
        pendingTarget: id,
      };
      this.publish();
      await this.persistence.persist();
      this.ports.navigate(url.href);
      return true;
    }
    const target = this.ports.resolve(entry.record);
    this.controller.document = { ...this.controller.document, pendingTarget: null };
    if (!target) {
      this.publish();
      await this.persistence.persist();
      return false;
    }
    this.ports.annotations.rebindTargets(this.ports.resolve);
    this.ports.restoreTarget?.(entry.record, target);
    const result = this.ports.openTarget(target);
    this.publish();
    return result;
  };
  deleteRecord = async (id: string) => {
    const entry = this.controller.document.entries.find((item) => item.id === id);
    if (!entry) return;
    const before = this.controller.document;
    this.applying = true;
    try {
      const target =
        entry.record.evidence.pageUrl === this.ports.pageUrl()
          ? this.ports.resolve(entry.record)
          : null;
      if (target) this.ports.removeTarget(target);
      if (
        entry.record.evidence.pageUrl === this.ports.pageUrl() &&
        this.ports.annotations
          .captureSnapshot()
          .domRecords.some(
            (record) =>
              record.annotationId === entry.record.annotationId &&
              Boolean(
                record.comment || record.designReview?.action || record.propertyChanges.length
              )
          )
      ) {
        const local = this.ports.annotations.captureSnapshot();
        local.domRecords = local.domRecords.flatMap((record) => {
          if (record.annotationId !== entry.record.annotationId) return [record];
          const {
            comment: _comment,
            designReview: _review,
            markerNumber: _marker,
            ...retained
          } = record;
          return retained.textChange || retained.textMarkers?.length
            ? [{ ...retained, propertyChanges: [] }]
            : [];
        });
        this.ports.annotations.applySnapshot(local);
      }
      this.controller.remove(id);
      this.publish();
      await this.persistence.persist();
    } catch (error) {
      this.controller.document = before;
      this.restorePage();
      throw error;
    } finally {
      this.applying = false;
    }
  };
  undoDelete = async () => {
    const before = this.controller.document;
    this.applying = true;
    this.controller.undo();
    this.publish();
    try {
      await this.persistence.persist();
      this.restorePage();
    } catch (error) {
      this.controller.document = before;
      this.publish();
      throw error;
    } finally {
      this.applying = false;
    }
  };
  clear = async () => {
    const before = this.controller.document;
    this.applying = true;
    try {
      await this.ports.clearTargets();
      this.controller.clear();
      this.publish();
      await this.persistence.persist('clear');
      this.restorePage(true);
    } catch (error) {
      this.controller.document = before;
      this.restorePage();
      throw error;
    } finally {
      this.applying = false;
    }
  };
  captureCurrent = async (source: ContentPrivilegedActionIntentSource) => {
    if (this.capturing) return;
    this.capturing = true;
    try {
      const page = this.currentPage;
      for (const entry of [...this.controller.document.entries]) {
        if (entry.record.evidence.pageUrl !== page) continue;
        const signature = JSON.stringify(entry.record);
        if (this.captured.get(entry.id) === signature) continue;
        try {
          const preview = await this.ports.capture(entry, source);
          if (this.disposed || this.ports.pageUrl() !== page) return;
          if (preview && this.controller.setPreview(entry.id, signature, preview)) {
            this.captured.set(entry.id, signature);
            this.publish();
            await this.persistence.persist();
          }
        } catch {
          /* Accepted text and the previous preview remain available. */
        }
      }
    } finally {
      this.capturing = false;
    }
  };
  exportSnapshot = () => {
    this.changed();
    return this.controller.snapshot();
  };
  document = () => this.controller.document;
  dispose = () => {
    this.disposed = true;
    this.listeners.clear();
  };
}

/** Creates the bound runtime methods consumed by the overlay and navigation adapters. */
export function createReviewSessionRuntime(ports: RuntimePorts) {
  return new ReviewSessionRuntimeOwner(ports);
}
export type ReviewSessionRuntime = ReturnType<typeof createReviewSessionRuntime>;
