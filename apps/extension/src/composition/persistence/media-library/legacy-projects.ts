import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  normalizeBrowserFrameState,
  normalizeEditorFrameSettings,
} from '../../../features/editor/document/constants';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { createNewWorkspacePresentationSettings } from '../../../features/video/review/advanced/presentation';
import type { StoredImageWorkspaceEntry } from '../image-workspaces/contracts';
import type { VideoWorkspace } from '../review-workspaces/contracts';
import { sameReviewWorkspaceValue } from '../review-workspaces/history-retention';
import type { MediaLibraryEntry } from './contracts';

function legacyIdentity(sourceId: string): string {
  const bytes = sha256(new TextEncoder().encode(JSON.stringify(sourceId)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** An earlier Image document shared the original's identity. */
export function legacyImageProjectId(sourceId: string): string {
  return `image-project:legacy:${legacyIdentity(sourceId)}`;
}

/** Keep the source family used by the current Quick Edit route and archive codec. */
export function legacyQuickEditProjectId(source: Pick<MediaLibraryEntry, 'id' | 'source'>): string {
  const kind = source.source.kind === 'project-export' ? 'export' : source.source.kind;
  return `${kind}:quick-project:legacy-${legacyIdentity(source.id)}`;
}

/** Old combined rows stay intact while their existing capture or checkpoint owns them. */
export async function hasLegacyLibraryCapture(
  read: (key: string) => Promise<unknown>,
  kind: 'media' | 'video-review',
  id: string
): Promise<boolean> {
  const profile = await read('profile');
  if (profile === undefined) return false;
  if (!isRecord(profile) || typeof profile['spaceId'] !== 'string') return true;
  const key = JSON.stringify([profile['spaceId'], kind, id]);
  const [state, pending] = await Promise.all([
    read(JSON.stringify(['root-state', key])),
    read(JSON.stringify(['pending-checkpoint', key])),
  ]);
  return state !== undefined || pending !== undefined;
}

/** Recognize only a first open whose retained document still has its default appearance. */
export function isUneditedLegacyImage(
  workspace: StoredImageWorkspaceEntry,
  originalName: string
): boolean {
  const { document, history } = workspace;
  const { backgroundImage, ...frame } = document.frame;
  const { favicon, ...browserFrame } = document.browserFrame ?? {};
  if (
    workspace.revision !== 1 ||
    (history && (history.snapshots.length !== 1 || history.actions.some(Boolean))) ||
    (document.displayName && document.displayName !== originalName) ||
    favicon ||
    !sameReviewWorkspaceValue(
      normalizeBrowserFrameState(browserFrame),
      normalizeBrowserFrameState(null)
    ) ||
    document.compositionBase ||
    document.richShapes?.length ||
    backgroundImage ||
    document.sourceDisplayWidth !== document.sourceWidth ||
    document.sourceDisplayHeight !== document.sourceHeight ||
    !sameReviewWorkspaceValue(
      normalizeEditorFrameSettings({ ...frame, backgroundImageData: null }),
      normalizeEditorFrameSettings(null)
    )
  )
    return false;
  try {
    const canvas: unknown = JSON.parse(document.canvasJson);
    if (!isRecord(canvas) || !Array.isArray(canvas['objects'])) return false;
    return canvas['objects'].length === 0;
  } catch {
    return false;
  }
}

/** A first-open Quick Edit row used the same defaults as a new editing session. */
export function isUneditedLegacyQuickEdit(
  workspace: VideoWorkspace,
  originalName: string
): boolean {
  if (
    workspace.revision !== 1 ||
    workspace.updatedAt !== workspace.createdAt ||
    workspace.history.length ||
    workspace.baseline ||
    workspace.typing ||
    workspace.effectSnapshots?.length ||
    workspace.project?.lifecycle.trashedAt !== undefined ||
    (workspace.project && workspace.project.name !== originalName.trim().slice(0, 256))
  )
    return false;
  const { ui: _session, ...content } = workspace.advanced;
  const { ui: _defaultSession, ...defaults } = createQuickEditAdvancedState();
  return sameReviewWorkspaceValue(content, {
    ...defaults,
    background: { enabled: false, zoomBehavior: 'window' },
    presentation: createNewWorkspacePresentationSettings(),
  });
}
