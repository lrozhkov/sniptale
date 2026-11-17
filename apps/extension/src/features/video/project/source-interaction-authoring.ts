import { recordingIdForProjectAsset } from './source-interactions';
import { patchVideoProjectActionFeedback } from './action-feedback/projection';
import { isVideoProjectUtilityLaneLocked } from './utility-lanes';
import type { VideoProjectActionFeedback } from './action-feedback/types';
import {
  projectSourceInteractionActions,
  isResultSourceInteractionAction,
  parseVideoProjectSourceInteractionDocuments,
} from './source-interaction-documents';
import { resolveVideoProjectActionPresentations } from './action-presentation';
import { getVideoClipInteractionTime, getVideoClipSourceTime } from './timeline/rate';
import { isVideoProjectActionPresentationOverride } from './validation/interaction';
import type { VideoProject, VideoProjectActionPresentationOverride } from './types';

type Patch = {
  clipId?: string | null;
  time?: number;
  point?: { x: number; y: number } | null;
  presentation?: VideoProjectActionPresentationOverride | null;
};
export function projectSourceInteractionOwner(project: VideoProject, eventId: string) {
  for (const document of project.sourceInteractionDocuments ?? []) {
    const press = document.timeline.presses.find(
      (press) => JSON.stringify(['authored-source-input', document.id, press.id]) === eventId
    );
    if (press) return { document, press };
  }
  return null;
}
/** Native edits retain source-clock authoring and use the existing aggregate history transaction. */
export function editProjectSourceInteraction(
  project: VideoProject,
  eventId: string,
  patch: Patch
): VideoProject | null {
  const owned = projectSourceInteractionOwner(project, eventId);
  if (!owned) return null;
  if (patch.time === undefined && patch.point === undefined && patch.presentation === undefined)
    return project;
  if (patch.presentation && !isVideoProjectActionPresentationOverride(patch.presentation))
    return project;
  const event = projectSourceInteractionActions(project, project.actionEvents).find(
    (event) => event.id === eventId
  );
  if (!event) return project;
  const row = resolveVideoProjectActionPresentations(project, [event]).find(
    (row) => row.occurrence.eventId === eventId && row.occurrence.clipId === patch.clipId
  );
  if (
    (patch.time !== undefined ||
      patch.point !== undefined ||
      patch.presentation?.point !== undefined) &&
    !row
  )
    return project;
  let press = { ...owned.press };
  let overrides = owned.document.timeline.overrides;
  if (patch.time !== undefined) {
    if (!Number.isFinite(patch.time)) return project;
    const clip = project.clips.find(
      (clip) => clip.type === 'VIDEO' && clip.id === row!.occurrence.clipId
    );
    if (!clip || clip.type !== 'VIDEO') return project;
    const current = Math.max(
      clip.startTime,
      Math.min(clip.startTime + clip.duration - 1 / project.fps, row!.animationStart)
    );
    const requested = Math.max(
      clip.startTime,
      Math.min(clip.startTime + clip.duration - 1 / project.fps, patch.time)
    );
    const clock = isResultSourceInteractionAction(project, event)
      ? getVideoClipInteractionTime
      : getVideoClipSourceTime;
    const delta = clock(clip, requested) - clock(clip, current);
    press = { ...press, start: press.start + delta, end: press.end + delta };
    overrides = overrides.map((item) =>
      item.ref.kind === 'action' && item.ref.id === press.id
        ? { ...item, start: item.start + delta, end: item.end + delta }
        : item
    );
  }
  const point = patch.point !== undefined ? patch.point : patch.presentation?.point;
  if (point !== undefined) {
    if (
      press.family === 'keyboard' ||
      point === null ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    )
      return project;
    press = { ...press, x: point.x, y: point.y };
  }
  let actionOverrides = owned.document.actionOverrides;
  if (patch.presentation !== undefined) {
    actionOverrides = (actionOverrides ?? []).filter((item) => item.id !== press.id);
    if (patch.presentation) {
      const { point: _point, ...presentation } = patch.presentation;
      if (Object.keys(presentation).length) actionOverrides.push({ id: press.id, presentation });
    }
  }
  const documents = project.sourceInteractionDocuments!.map((document) =>
    document === owned.document
      ? {
          ...document,
          timeline: {
            ...document.timeline,
            overrides,
            presses: document.timeline.presses.map((item) => (item.id === press.id ? press : item)),
          },
          ...(actionOverrides ? { actionOverrides } : {}),
        }
      : document
  );
  const parsed = parseVideoProjectSourceInteractionDocuments(documents);
  return parsed ? { ...project, sourceInteractionDocuments: parsed } : project;
}
/** Only user-authored presses are removed; captured facts and unrelated source documents remain. */
export function deleteProjectSourceInteraction(
  project: VideoProject,
  eventId: string
): VideoProject | null {
  const owned = projectSourceInteractionOwner(project, eventId);
  if (!owned) return null;
  return {
    ...project,
    sourceInteractionDocuments: project.sourceInteractionDocuments!.map((document) =>
      document === owned.document
        ? {
            ...document,
            timeline: {
              presses: document.timeline.presses.filter((press) => press.id !== owned.press.id),
              overrides: document.timeline.overrides.filter(
                (item) => item.ref.kind !== 'action' || item.ref.id !== owned.press.id
              ),
            },
            ...(document.actionOverrides
              ? {
                  actionOverrides: document.actionOverrides.filter(
                    (item) => item.id !== owned.press.id
                  ),
                }
              : {}),
          }
        : document
    ),
  };
}

/** Inspector feedback reads the same source-owned styles that the frame and audio planners consume. */
export function sourceInteractionFeedback(
  project: VideoProject,
  eventId: string
): Pick<VideoProjectActionFeedback, 'settings' | 'gestureStyles' | 'keyStyles'> | null {
  const owned = projectSourceInteractionOwner(project, eventId);
  if (!owned) return null;
  const recordingId = recordingIdForProjectAsset(
    project.assets.find((asset) => asset.id === owned.document.binding.assetId)
  );
  return recordingId
    ? (project.actionFeedback?.find(
        (group) =>
          group.recordingId === recordingId &&
          group.sourceInstanceId === owned.document.binding.sourceInstanceId
      ) ?? { settings: [] })
    : (owned.document.feedback ?? { settings: [] });
}
export function patchSourceInteractionFeedback(
  project: VideoProject,
  eventId: string,
  patch: Partial<Pick<VideoProjectActionFeedback, 'settings' | 'gestureStyles' | 'keyStyles'>>
): VideoProject {
  const owned = projectSourceInteractionOwner(project, eventId);
  if (!owned || isVideoProjectUtilityLaneLocked(project, 'actions')) return project;
  const recordingId = recordingIdForProjectAsset(
    project.assets.find((asset) => asset.id === owned.document.binding.assetId)
  );
  if (recordingId) {
    const identity = { recordingId, sourceInstanceId: owned.document.binding.sourceInstanceId };
    const groups = project.actionFeedback ?? [];
    const base = groups.some(
      (group) =>
        group.recordingId === recordingId && group.sourceInstanceId === identity.sourceInstanceId
    )
      ? project
      : { ...project, actionFeedback: [...groups, { ...identity, settings: [], signals: [] }] };
    return patchVideoProjectActionFeedback(base, identity, patch);
  }
  const documents = project.sourceInteractionDocuments!.map((document) =>
    document === owned.document
      ? { ...document, feedback: { settings: [], ...document.feedback, ...patch } }
      : document
  );
  const parsed = parseVideoProjectSourceInteractionDocuments(documents);
  return parsed ? { ...project, sourceInteractionDocuments: parsed } : project;
}
