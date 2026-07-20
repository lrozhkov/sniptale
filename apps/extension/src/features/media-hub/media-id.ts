export function createRecordingMediaId(recordingId: string): string {
  return `recording:${recordingId}`;
}

export function createProjectAssetMediaId(projectAssetId: string): string {
  return `project-asset:${projectAssetId}`;
}
