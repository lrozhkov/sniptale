import { parseVideoProjectPlacementBinding } from '../validation/placement-binding';
import { MAX_VIDEO_PROJECT_DURATION_SECONDS } from '../validation/primitives';
import { isVideoProjectDurationMode } from '../types/layout';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseReviewCaptionSettings, parseReviewTextDocument } from '../../review/text-validation';
import type { VideoProject } from '../types/model';
import type { VideoProjectTextBinding, VideoProjectTextDocument } from './types';

function identity(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value
  );
}

/** Parses descriptive placement identity without requiring a current source reference. */
export function parseVideoProjectTextBinding(value: unknown): VideoProjectTextBinding | null {
  return parseVideoProjectPlacementBinding(value);
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
  const binding = parseVideoProjectTextBinding(value['binding']);
  const document = parseReviewTextDocument(value['document']);
  const captions =
    value['captions'] === undefined ? undefined : parseReviewCaptionSettings(value['captions']);
  if (!binding || !document || captions === null) return null;
  const durationMode = value['durationMode'];
  if (
    durationMode !== undefined &&
    (binding.kind !== 'project' || !isVideoProjectDurationMode(durationMode))
  )
    return null;
  const limits = value['resultEndLimits'];
  const resultEndLimits: NonNullable<VideoProjectTextDocument['resultEndLimits']> = [];
  if (limits !== undefined) {
    if (binding.kind !== 'project' || !Array.isArray(limits) || limits.length > 2_000) return null;
    const ids = new Set<string>();
    for (const limit of limits) {
      if (
        !isRecord(limit) ||
        Object.keys(limit).length !== 2 ||
        !identity(limit['fragmentId']) ||
        ids.has(limit['fragmentId']) ||
        !document.fragments.some((fragment) => fragment.id === limit['fragmentId']) ||
        typeof limit['end'] !== 'number' ||
        !Number.isFinite(limit['end']) ||
        limit['end'] < 0 ||
        limit['end'] > MAX_VIDEO_PROJECT_DURATION_SECONDS
      )
        return null;
      ids.add(limit['fragmentId']);
      resultEndLimits.push({ fragmentId: limit['fragmentId'], end: limit['end'] });
    }
  }
  const domain = binding.kind === 'source' ? 'source' : 'result';
  if (document.fragments.some((fragment) => fragment.timeDomain !== domain)) return null;
  return {
    id: value['id'],
    binding,
    document,
    ...(durationMode === undefined ? {} : { durationMode }),
    ...(limits === undefined ? {} : { resultEndLimits }),
    ...(captions ? { captions } : {}),
  };
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
