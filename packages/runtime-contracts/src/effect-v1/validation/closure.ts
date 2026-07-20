import {
  type EffectV1DiagnosticReporter,
  type EffectV1Record,
  isRecord,
  toRecordArray,
} from './shared.js';

export function validateEffectV1Closures(
  input: EffectV1Record,
  references: {
    assets: Map<string, EffectV1Record>;
    controls: Set<string>;
    tracks: Set<string>;
  },
  report: EffectV1DiagnosticReporter
): void {
  validateControlClosure(input, references.controls, report);
  validateTrackClosure(input, references.tracks, report);
  validatePhaseClosure(input, report);
  validateAssetClosure(input, references.assets, report);
}

function validatePhaseClosure(input: EffectV1Record, report: EffectV1DiagnosticReporter): void {
  const used = new Set<string>();
  const timeline = isRecord(input['timeline']) ? input['timeline'] : {};
  const tracks = toRecordArray(timeline['tracks']);
  for (const track of tracks) {
    if (typeof track['phaseId'] === 'string') used.add(track['phaseId']);
    for (const keyframe of toRecordArray(track['keyframes'])) {
      if (typeof keyframe['phaseId'] === 'string') used.add(keyframe['phaseId']);
    }
  }
  toRecordArray(timeline['phases']).forEach((phase, index) => {
    if (typeof phase['id'] !== 'string' || used.has(phase['id'])) return;
    report.error(
      'PHASE_UNUSED',
      `$.timeline.phases[${index}]`,
      `Phase "${phase['id']}" never gates a track or keyframe.`,
      `Reference "${phase['id']}" from track.phaseId or keyframe.phaseId, or remove the phase.`
    );
  });
}

function validateTrackClosure(
  input: EffectV1Record,
  tracks: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  const used = new Set<string>();
  collectReadIds(input['program'], 'tracks.', used);
  for (const trackId of tracks) {
    if (used.has(trackId)) continue;
    const timeline = isRecord(input['timeline']) ? input['timeline'] : {};
    const index = toRecordArray(timeline['tracks']).findIndex((track) => track['id'] === trackId);
    report.error(
      'TRACK_UNUSED',
      index >= 0 ? `$.timeline.tracks[${index}]` : '$.timeline.tracks',
      `Track "${trackId}" is editable but never read by the graph.`,
      `Read "tracks.${trackId}" from a command or definition, or remove the track.`
    );
  }
}

function validateControlClosure(
  input: EffectV1Record,
  controls: Set<string>,
  report: EffectV1DiagnosticReporter
): void {
  const used = new Set<string>();
  collectReadIds(input['program'], 'controls.', used);
  for (const controlId of controls) {
    if (used.has(controlId)) continue;
    const index = toRecordArray(input['controls']).findIndex(
      (control) => control['id'] === controlId
    );
    report.error(
      'CONTROL_UNUSED',
      index >= 0 ? `$.controls[${index}]` : '$.controls',
      `Control "${controlId}" is exposed but never read by the graph.`,
      `Read "controls.${controlId}" from a command or definition, or remove the control.`
    );
  }
}

function collectReadIds(value: unknown, prefix: string, result: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReadIds(item, prefix, result));
    return;
  }
  if (!isRecord(value)) return;
  if (
    value['op'] === 'read' &&
    typeof value['path'] === 'string' &&
    value['path'].startsWith(prefix)
  ) {
    result.add(value['path'].slice(prefix.length));
  }
  Object.values(value).forEach((item) => collectReadIds(item, prefix, result));
}

function validateAssetClosure(
  input: EffectV1Record,
  assets: Map<string, EffectV1Record>,
  report: EffectV1DiagnosticReporter
): void {
  const used = new Set<string>();
  for (const layer of toRecordArray(input['layers'])) {
    if (typeof layer['assetId'] === 'string') used.add(layer['assetId']);
  }
  const program = isRecord(input['program']) ? input['program'] : {};
  collectCommandAssetIds(program['commands'], used);
  for (const [assetId] of assets) {
    if (used.has(assetId)) continue;
    const index = toRecordArray(input['assets']).findIndex((asset) => asset['id'] === assetId);
    report.error(
      'ASSET_UNUSED',
      index >= 0 ? `$.assets[${index}]` : '$.assets',
      `Asset "${assetId}" is declared but never used.`,
      'Reference it from a layer or graph command, or remove it from the bundle.'
    );
  }
}

function collectCommandAssetIds(value: unknown, used: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const command of value) {
    if (!isRecord(command)) continue;
    if (typeof command['assetId'] === 'string') used.add(command['assetId']);
    collectCommandAssetIds(command['commands'], used);
  }
}
