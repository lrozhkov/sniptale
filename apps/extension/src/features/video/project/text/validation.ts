import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewCaptionSettings, parseReviewTextDocument } from '../../review/text-validation';
import type { VideoProject } from '../types/model';
import type { VideoProjectTextBinding, VideoProjectTextDocument } from './types';

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

function parseBinding(value: unknown): VideoProjectTextBinding | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'project' && Object.keys(value).length === 1) return { kind: 'project' };
  if (
    value['kind'] === 'source' &&
    Object.keys(value).length === 3 &&
    identity(value['assetId']) &&
    identity(value['sourceInstanceId'])
  )
    return {
      kind: 'source',
      assetId: value['assetId'],
      sourceInstanceId: value['sourceInstanceId'],
    };
  return null;
}

function withinTextBudget(value: unknown[]): boolean {
  const fragments: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry['document'])) return false;
    const entries = entry['document']['fragments'];
    if (!Array.isArray(entries) || fragments.length + entries.length > 2_000) return false;
    for (const fragment of entries) {
      if (!isRecord(fragment)) return false;
      fragments.push({ ...fragment, id: String(fragments.length) });
    }
  }
  // Fragment IDs are local; this disposable document checks only shared content budgets.
  return parseReviewTextDocument({ version: 1, fragments }) !== null;
}

function parseTextDocument(value: unknown): VideoProjectTextDocument | null {
  if (!isRecord(value) || !identity(value['id'])) return null;
  const binding = parseBinding(value['binding']);
  const document = parseReviewTextDocument(value['document']);
  const captions =
    value['captions'] === undefined ? undefined : parseReviewCaptionSettings(value['captions']);
  if (!binding || !document || captions === null) return null;
  const domain = binding.kind === 'source' ? 'source' : 'result';
  if (document.fragments.some((fragment) => fragment.timeDomain !== domain)) return null;
  return { id: value['id'], binding, document, ...(captions ? { captions } : {}) };
}

/** Uses the gallery text parser and its aggregate budgets across all montage placements. */
export function parseVideoProjectTextDocuments(value: unknown): VideoProjectTextDocument[] | null {
  if (!Array.isArray(value) || value.length > 2_000 || !withinTextBudget(value)) return null;
  const documents: VideoProjectTextDocument[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const document = parseTextDocument(raw);
    if (!document || ids.has(document.id)) return null;
    ids.add(document.id);
    documents.push(document);
  }
  return documents;
}

/** An absent source placement is dormant content; a missing or conflicting asset is invalid. */
export function hasValidVideoProjectTextReferences(project: VideoProject): boolean {
  return (project.textDocuments ?? []).every(({ binding }) => {
    if (binding.kind === 'project') return true;
    const asset = project.assets.find((item) => item.id === binding.assetId);
    if (!asset || asset.type === 'IMAGE') return false;
    return project.clips.every(
      (clip) =>
        !('sourceInstanceId' in clip) ||
        clip.sourceInstanceId !== binding.sourceInstanceId ||
        clip.assetId === binding.assetId
    );
  });
}
