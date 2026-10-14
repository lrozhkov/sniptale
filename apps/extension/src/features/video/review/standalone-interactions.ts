import { applyVideoProjectMutationPatch } from '../project/mutation';
import { getVideoProjectActionPresentation } from '../project/action-presentation';
import type { VideoProject } from '../project/types';
import type { QuickEditAdvancedContent } from './advanced/types';

/** Copies accepted source-time interaction authoring when opening a recording in Montage. */
export function applyRecordingReviewInteractions(
  project: VideoProject,
  recordingId: string,
  content: QuickEditAdvancedContent
): VideoProject {
  if (
    content.cursorFocusPath === undefined &&
    content.cameraFollowDefaults === undefined &&
    content.actionAudio === undefined &&
    content.clickAnimations === undefined &&
    content.actionsEnabled === undefined
  )
    return project;
  const clip = project.clips.find((item) => {
    if (item.type !== 'VIDEO') return false;
    const asset = project.assets.find((candidate) => candidate.id === item.assetId);
    return (
      (asset?.source.kind === 'recording' && asset.source.recordingId === recordingId) ||
      (asset?.source.kind === 'project-asset' && asset.source.originRecordingId === recordingId)
    );
  });
  if (!clip || clip.type !== 'VIDEO' || !clip.sourceInstanceId)
    throw new Error('Review interaction source is unavailable.');
  const sourceInstanceId = clip.sourceInstanceId;
  const keyIds = handoffCapturedKeyIdentities(project, recordingId, sourceInstanceId);
  const current = project.actionFeedback?.find(
    (group) => group.recordingId === recordingId && group.sourceInstanceId === sourceInstanceId
  );
  const styles = content.clickAnimations ?? current?.gestureStyles;
  const group = {
    recordingId,
    sourceInstanceId,
    signals: structuredClone(current?.signals ?? []),
    settings: structuredClone(content.actionAudio ?? current?.settings ?? []),
    ...(styles ? { gestureStyles: structuredClone(styles) } : {}),
  };
  const cursorFocusPath = content.cursorFocusPath
    ? {
        ...structuredClone(content.cursorFocusPath),
        segments: content.cursorFocusPath.segments.map((segment) => {
          if (
            segment.binding.kind === 'recording-source' &&
            segment.binding.recordingId !== recordingId
          )
            throw new Error('Review interaction source is inconsistent.');
          return {
            ...structuredClone(segment),
            binding: { kind: 'recording-source' as const, recordingId, sourceInstanceId },
            keys: segment.keys.map((key) => ({
              ...structuredClone(key),
              id: handoffKeyId(key.id, keyIds),
            })),
          };
        }),
      }
    : undefined;
  return applyVideoProjectMutationPatch(project, {
    ...(content.cameraFollowDefaults
      ? { cameraFollowDefaults: structuredClone(content.cameraFollowDefaults) }
      : {}),
    actionFeedback: [...(project.actionFeedback ?? []).filter((item) => item !== current), group],
    ...(cursorFocusPath ? { cursorFocusPath } : {}),
    ...(content.actionsEnabled === undefined
      ? {}
      : {
          actionPresentation: {
            ...getVideoProjectActionPresentation(project),
            enabled: content.actionsEnabled,
          },
        }),
  });
}

/** Captured facts keep their source identities; Montage's event identities are independent. */
function handoffCapturedKeyIdentities(
  project: VideoProject,
  recordingId: string,
  sourceInstanceId: string
) {
  const identities = new Map<string, string>();
  for (const event of project.actionEvents) {
    const anchor = event.anchor;
    if (
      anchor.kind !== 'recording-source' ||
      anchor.recordingId !== recordingId ||
      anchor.sourceInstanceId !== sourceInstanceId
    )
      continue;
    identities.set(`click:${anchor.sourceEventId}`, `click:${event.id}`);
    identities.set(`release:${anchor.sourceEventId}`, `release:${event.id}`);
  }
  for (const group of project.actionFeedback ?? []) {
    if (group.recordingId !== recordingId || group.sourceInstanceId !== sourceInstanceId) continue;
    for (const signal of group.signals) {
      if (signal.kind !== 'cursor-idle') continue;
      identities.set(`dwell-start:${signal.id}`, `dwell-start:${sourceInstanceId}:${signal.id}`);
      identities.set(`dwell-end:${signal.id}`, `dwell-end:${sourceInstanceId}:${signal.id}`);
    }
  }
  return identities;
}

function handoffKeyId(id: string, identities: ReadonlyMap<string, string>): string {
  const prefix = 'focus-override:';
  if (!id.startsWith(prefix)) return identities.get(id) ?? id;
  const captured = id.slice(prefix.length);
  return identities.has(captured) ? `${prefix}${identities.get(captured)}` : id;
}
