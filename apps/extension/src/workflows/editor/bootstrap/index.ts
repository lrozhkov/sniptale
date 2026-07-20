import type { EditorBootstrapPayload } from '../../../features/editor/contracts/bootstrap';
import {
  consumePersistedEditorBootstrapPayload,
  persistEditorBootstrapPayload,
} from '../../../composition/persistence/editor-bootstrap/retention';

let pendingEditorBootstrapPayload: EditorBootstrapPayload | null = null;
export type { EditorBootstrapPayload } from '../../../features/editor/contracts/bootstrap';

/**
 * Caches a payload inside the current runtime context without persisting it cross-context.
 */
export function primePendingEditorBootstrapPayload(payload: EditorBootstrapPayload): void {
  pendingEditorBootstrapPayload = payload;
}

/**
 * Persists a payload for cross-context editor bootstrap and returns a lightweight transport id.
 */
export async function persistPendingEditorBootstrapPayload(
  payload: EditorBootstrapPayload
): Promise<string> {
  return persistEditorBootstrapPayload(payload);
}

/**
 * Resolves and consumes either the current runtime payload or a persisted bootstrap payload id.
 */
export async function consumePendingEditorBootstrapPayload(
  bootstrapId?: string | null
): Promise<EditorBootstrapPayload | null> {
  if (pendingEditorBootstrapPayload) {
    const payload = pendingEditorBootstrapPayload;
    pendingEditorBootstrapPayload = null;
    return payload;
  }

  if (!bootstrapId) {
    return null;
  }

  return consumePersistedEditorBootstrapPayload(bootstrapId);
}
