// Recording interaction diagnostics shared by background, content, and video editor.

/**
 * Kind of diagnostic event
 */
type DiagnosticEventKind = 'error' | 'action' | 'meta';

/**
 * Log level for error and action events
 */
export type DiagnosticLevel = 'error' | 'warn' | 'info' | 'log';

/**
 * Single diagnostic event with timestamp relative to recording start
 */
export interface DiagnosticEvent {
  id: string; // crypto.randomUUID()
  recordingId: string; // Link to recording
  tsMs: number; // Milliseconds from recording start
  kind: DiagnosticEventKind;
  level?: DiagnosticLevel; // For error/action severity
  message: string;
  data?: unknown; // Sanitized structured clone friendly payload
}

/**
 * Metadata about the recording session
 */
export interface DiagnosticMeta {
  url: string;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  recordingStartedAt: string;
  recordingEndedAt?: string;
  interrupted?: boolean;
}

/**
 * Chunk of events for IndexedDB storage (to avoid large single records)
 * Each chunk contains ~1000 events
 */
export interface DiagnosticEventChunk {
  recordingId: string;
  chunkIndex: number; // 0, 1, 2, ...
  events: DiagnosticEvent[];
}

/**
 * Main diagnostics entry - stored in diagnostics_meta store
 * Contains summary and metadata, events stored separately in chunks
 */
export interface DiagnosticsEntry {
  recordingId: string; // Primary key
  schemaVersion: 2;
  meta: DiagnosticMeta;
  totalEvents: number;
  chunksCount: number;
  createdAt: string; // ISO timestamp
}

/**
 * Active session state in memory (Background SW)
 */
export interface ActiveDiagnosticsSession {
  recordingId: string;
  tabId: number;
  startedAt: number; // performance.now() for relative timing
  meta: DiagnosticMeta;
  events: DiagnosticEvent[];
  isPaused: boolean; // True when recording stopped but not yet finalized
}

/**
 * Session data for chrome.storage.session (SW sleep recovery)
 */
export interface SessionSnapshot {
  recordingId: string;
  tabId: number;
  startedAt: number;
  meta: DiagnosticMeta;
  events: DiagnosticEvent[];
  isPaused: boolean;
}

/**
 * Message from content script to background
 * type field is added when sending, so it's optional here
 */
export interface DiagnosticEventFromCS {
  type?: 'DIAGNOSTIC_EVENT_FROM_CS';
  kind: 'error' | 'action';
  level?: DiagnosticLevel;
  message: string;
  data?: unknown; // Sanitized before persistence/export
  tsMs?: number; // Optional, calculated in background if not provided
}

/**
 * ZIP archive structure:
 * bug-report/
 *   video.webm
 *   diagnostics.json          // DiagnosticsEntry + events
 *   meta.json                 // BugReportMeta
 */
