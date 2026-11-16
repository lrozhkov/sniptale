import type { VideoProjectMetadata } from './validation';

/** Typed native source locators; selection and translated descriptions do not retain resources. */
const VIDEO_PROJECT_HISTORY_SOURCE_KINDS = [
  'recording',
  'library-asset',
  'project-asset',
  'scenario-asset',
  'scenario-project',
] as const;

interface VideoProjectHistorySourceReference {
  kind: (typeof VIDEO_PROJECT_HISTORY_SOURCE_KINDS)[number];
  id: string;
}

/** Source facts can outlive their current clip placement in the same admitted project. */
export function collectVideoProjectHistorySources(
  project: VideoProjectMetadata
): readonly VideoProjectHistorySourceReference[] {
  const sources = new Map<string, VideoProjectHistorySourceReference>();
  const seen = new Map<VideoProjectHistorySourceReference['kind'], Set<string>>();
  const add = (kind: VideoProjectHistorySourceReference['kind'], id: string) => {
    const identities = seen.get(kind) ?? new Set<string>();
    if (identities.has(id)) return;
    identities.add(id);
    seen.set(kind, identities);
    sources.set(JSON.stringify([kind, id]), { kind, id });
  };
  if (project.source.kind === 'recording') add('recording', project.source.recordingId);
  if (project.baseRecordingId) add('recording', project.baseRecordingId);
  if (project.source.kind === 'scenario') add('scenario-project', project.source.scenarioProjectId);
  for (const asset of project.assets) {
    const source = asset.source;
    switch (source.kind) {
      case 'recording':
        add('recording', source.recordingId);
        break;
      case 'library-asset':
        add('library-asset', source.mediaId);
        break;
      case 'scenario-asset':
        add('scenario-asset', source.scenarioAssetId);
        break;
      case 'project-asset':
        add('project-asset', source.projectAssetId);
        if (source.originMediaId) add('library-asset', source.originMediaId);
        if (source.originRecordingId) add('recording', source.originRecordingId);
        break;
    }
    if (asset.recordingPart) add('recording', asset.recordingPart.recordingId);
  }
  for (const group of project.cursorTrack?.sourceObservations ?? [])
    add('recording', group.recordingId);
  for (const sample of project.cursorTrack?.samples ?? [])
    if (sample.sourceAnchor) add('recording', sample.sourceAnchor.recordingId);
  for (const segment of project.cursorFocusPath?.segments ?? [])
    if (segment.binding.kind === 'recording-source') add('recording', segment.binding.recordingId);
  for (const group of project.actionFeedback ?? []) add('recording', group.recordingId);
  for (const event of project.actionEvents ?? [])
    if (event.anchor.kind === 'recording-source') add('recording', event.anchor.recordingId);
  return Object.freeze([...sources.values()].map((source) => Object.freeze(source)));
}
