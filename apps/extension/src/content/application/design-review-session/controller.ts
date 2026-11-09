import { z } from 'zod';
import type {
  BrowserDomAnnotationRecord,
  BrowserAnnotationSessionSnapshot,
} from '../../parser/page-preparation/annotations';
import { parseBrowserAnnotationSnapshot } from '../../parser/page-preparation/history/recovery-parser';

export interface ReviewSessionPreview {
  dataUrl: string;
  width: number;
  height: number;
}
export interface ReviewSessionEntry {
  id: string;
  record: BrowserDomAnnotationRecord;
  preview?: ReviewSessionPreview;
  unavailable: boolean;
  pageTitle?: string;
}
export interface ReviewSessionDocument {
  version: 1;
  enabled: boolean;
  tool: 'navigate' | 'comment' | 'inspect' | 'compare' | 'move';
  panelOpen: boolean;
  position: { x: number; y: number };
  entries: ReviewSessionEntry[];
  pendingTarget: string | null;
  pinBefore?: boolean;
}
const previewSchema = z
  .object({
    dataUrl: z
      .string()
      .max(2_000_000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
    width: z.number().positive().max(4096),
    height: z.number().positive().max(4096),
  })
  .strict();
const recordSchema = z.unknown().transform((value, context) => {
  const snapshot = parseBrowserAnnotationSnapshot({
    schemaVersion: 1,
    nextAnnotationId: 1,
    nextCreationOrder: 1,
    nextMarkerNumber: 1,
    domRecords: [value],
    frameOrders: [],
  });
  if (!snapshot?.domRecords[0]) {
    context.addIssue({ code: 'custom', message: 'Invalid review evidence' });
    return z.NEVER;
  }
  return snapshot.domRecords[0];
});
const documentSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    tool: z.enum(['navigate', 'comment', 'inspect', 'compare', 'move']),
    panelOpen: z.boolean(),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    entries: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            record: recordSchema,
            preview: previewSchema.optional(),
            unavailable: z.boolean(),
            pageTitle: z.string().max(2048).optional(),
          })
          .strict()
      )
      .max(2000),
    pendingTarget: z.string().uuid().nullable(),
    pinBefore: z.boolean().optional(),
  })
  .strict()
  .refine((value) => new Set(value.entries.map((entry) => entry.id)).size === value.entries.length);

/** Parses private local evidence. The document runtime resolves every target again. */
function parseReviewSessionDocument(payload: string): ReviewSessionDocument | null {
  try {
    const parsed = documentSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) return null;
    const identities = parsed.data.entries.map((entry) =>
      JSON.stringify([entry.record.evidence.pageUrl, entry.record.annotationId])
    );
    if (new Set(identities).size !== identities.length) return null;
    const { pinBefore, ...fields } = parsed.data;
    return {
      ...fields,
      ...(pinBefore === undefined ? {} : { pinBefore }),
      entries: parsed.data.entries.map(({ preview, pageTitle, ...entry }) => ({
        ...entry,
        ...(preview ? { preview } : {}),
        ...(pageTitle === undefined ? {} : { pageTitle }),
      })),
    };
  } catch {
    return null;
  }
}
export function emptyReviewSessionDocument(): ReviewSessionDocument {
  return {
    version: 1,
    enabled: false,
    tool: 'comment',
    panelOpen: false,
    position: { x: 24, y: 72 },
    entries: [],
    pendingTarget: null,
  };
}

/** Owns the serializable projection. DOM absence never removes accepted evidence. */
export class ReviewSessionDocumentController {
  document = emptyReviewSessionDocument();
  private deleted: { entry: ReviewSessionEntry; index: number } | null = null;
  get canUndo() {
    return this.deleted !== null;
  }
  restore(payload: string): boolean {
    const document = parseReviewSessionDocument(payload);
    if (!document) return false;
    this.document = document;
    this.deleted = null;
    return true;
  }
  /** Projects this page while preserving unrelated text and allocating noncolliding annotation IDs. */
  projectPage(
    pageUrl: string,
    existing: BrowserAnnotationSessionSnapshot
  ): {
    snapshot: BrowserAnnotationSessionSnapshot;
    records: BrowserDomAnnotationRecord[];
  } {
    const records = this.document.entries
      .filter((entry) => entry.record.evidence.pageUrl === pageUrl)
      .map((entry) => entry.record);
    const unrelated = existing.domRecords.filter(
      (record) =>
        record.evidence.pageUrl === pageUrl &&
        !record.comment &&
        !record.designReview?.action &&
        record.propertyChanges.length === 0
    );
    let allocation = Math.max(
      existing.nextAnnotationId,
      ...records.map((record) => record.annotationId + 1)
    );
    const preserved = new Map(unrelated.map((record) => [record.annotationId, record]));
    for (let index = 0; index < records.length; index++) {
      let record = records[index]!;
      const other = preserved.get(record.annotationId);
      if (other && other.evidence.targetSelector !== record.evidence.targetSelector) {
        const priorId = record.annotationId;
        record = { ...record, annotationId: allocation++ };
        records[index] = record;
        this.document = {
          ...this.document,
          entries: this.document.entries.map((entry) =>
            entry.record.evidence.pageUrl === pageUrl && entry.record.annotationId === priorId
              ? { ...entry, record }
              : entry
          ),
        };
      } else if (other) {
        record = {
          ...record,
          ...(other.textChange ? { textChange: other.textChange } : {}),
          ...(other.textMarkers ? { textMarkers: other.textMarkers } : {}),
        };
        records[index] = record;
      }
      preserved.set(record.annotationId, record);
    }
    const allRecords = [...preserved.values()];
    const next = Math.max(allocation, ...allRecords.map((record) => record.annotationId + 1));
    return {
      records,
      snapshot: {
        ...existing,
        domRecords: allRecords,
        nextAnnotationId: Math.max(next, existing.nextAnnotationId),
        nextCreationOrder: Math.max(next, existing.nextCreationOrder),
        nextMarkerNumber: Math.max(
          next,
          ...records.map((record) => (record.markerNumber ?? 0) + 1)
        ),
      },
    };
  }
  sync(
    pageUrl: string,
    snapshot: BrowserAnnotationSessionSnapshot,
    removedIds: ReadonlySet<number> = new Set(),
    pageTitle?: string
  ): boolean {
    const records = snapshot.domRecords.filter(
      (record) =>
        record.evidence.pageUrl === pageUrl &&
        Boolean(record.comment || record.designReview?.action || record.propertyChanges.length)
    );
    const old = this.document.entries;
    const incoming = new Set(records.map((record) => record.annotationId));
    const next = old.filter(
      (entry) =>
        entry.record.evidence.pageUrl !== pageUrl ||
        (!incoming.has(entry.record.annotationId) && !removedIds.has(entry.record.annotationId))
    );
    for (const record of records) {
      const previous = old.find(
        (entry) =>
          entry.record.evidence.pageUrl === pageUrl &&
          entry.record.annotationId === record.annotationId
      );
      next.push({
        id: previous?.id ?? crypto.randomUUID(),
        record: structuredClone(record),
        unavailable: previous?.unavailable ?? false,
        ...(pageTitle === undefined
          ? previous?.pageTitle
            ? { pageTitle: previous.pageTitle }
            : {}
          : { pageTitle }),
        ...(previous?.preview ? { preview: previous.preview } : {}),
      });
    }
    // Keep chronological order stable while replacing a page's current records.
    next.sort((a, b) => {
      const ai = old.findIndex((entry) => entry.id === a.id);
      const bi = old.findIndex((entry) => entry.id === b.id);
      return (
        (ai < 0
          ? old.length + records.findIndex((r) => r.annotationId === a.record.annotationId)
          : ai) -
        (bi < 0
          ? old.length + records.findIndex((r) => r.annotationId === b.record.annotationId)
          : bi)
      );
    });
    if (JSON.stringify(old) === JSON.stringify(next)) return false;
    this.document = { ...this.document, entries: next };
    return true;
  }
  remove(id: string): void {
    const index = this.document.entries.findIndex((entry) => entry.id === id);
    const entry = this.document.entries[index];
    if (!entry) return;
    this.deleted = { entry, index };
    this.document = {
      ...this.document,
      entries: this.document.entries.filter((item) => item.id !== id),
    };
  }
  undo(): void {
    if (!this.deleted) return;
    const entries = [...this.document.entries];
    if (!entries.some((entry) => entry.id === this.deleted!.entry.id))
      entries.splice(this.deleted.index, 0, this.deleted.entry);
    this.document = { ...this.document, entries };
    this.deleted = null;
  }
  clear(): void {
    this.document = { ...this.document, entries: [], pendingTarget: null };
    this.deleted = null;
  }
  setPreview(id: string, signature: string, preview: ReviewSessionPreview): boolean {
    const entry = this.document.entries.find((item) => item.id === id);
    if (
      !entry ||
      JSON.stringify(entry.record) !== signature ||
      !previewSchema.safeParse(preview).success
    )
      return false;
    this.document = {
      ...this.document,
      entries: this.document.entries.map((item) => (item.id === id ? { ...item, preview } : item)),
    };
    return true;
  }
  snapshot(): {
    snapshot: BrowserAnnotationSessionSnapshot;
    previews: Map<number, ReviewSessionPreview>;
  } {
    const previews = new Map<number, ReviewSessionPreview>();
    const domRecords = this.document.entries.map((entry, index) => {
      const annotationId = index + 1;
      if (entry.preview) previews.set(annotationId, structuredClone(entry.preview));
      return {
        ...structuredClone(entry.record),
        annotationId,
        creationOrder: annotationId,
        evidence: {
          ...structuredClone(entry.record.evidence),
          fileLabel: entry.pageTitle ?? entry.record.evidence.fileLabel,
        },
      };
    });
    return {
      snapshot: {
        schemaVersion: 1,
        domRecords,
        frameOrders: [],
        nextAnnotationId: domRecords.length + 1,
        nextCreationOrder: domRecords.length + 1,
        nextMarkerNumber: domRecords.length + 1,
      },
      previews,
    };
  }
}
