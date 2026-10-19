import type { ScenarioProjectSnapshot } from '../../composition/persistence/scenario/contracts';
import { assertScenarioSpeechScope } from '../../composition/persistence/scenario/speech-scope';
import {
  readAudioStaging,
  discardAudioStaging,
} from '../../composition/persistence/assets/audio-staging';
import type { ScenarioSpeechScope, AudioStagedHandle } from '../../contracts/ai/audio';
import type { AISpeechModelParameters } from '../../contracts/settings/model-operation';
import {
  getScenarioNarrationText,
  type ScenarioNarrationText,
} from '../../features/scenario/project/public';
import { runReviewSpeechJob } from '../audio-jobs/client';

export interface ScenarioNarrationBasis {
  scope: ScenarioSpeechScope;
  text: string;
  expectedNarration: ScenarioNarrationText['narration'];
}
export interface ScenarioNarrationPreview extends ScenarioNarrationBasis {
  blob: Blob;
  url: string;
  staged: AudioStagedHandle;
  duration: number;
}

/** Captures exact committed targets before the first paid operation; the page owns explicit Save. */
export async function prepareScenarioNarrationBatch(
  snapshot: ScenarioProjectSnapshot,
  targets: readonly ScenarioNarrationText[],
  signal: AbortSignal
): Promise<ScenarioNarrationBasis[]> {
  if (!targets.length) throw new Error('invalid-request');
  const keys = targets.map((target) => JSON.stringify([target.slideId, target.objectId]));
  if (new Set(keys).size !== keys.length) throw new Error('invalid-request');
  const captured: ScenarioNarrationBasis[] = [];
  for (const target of targets) {
    signal.throwIfAborted();
    const saved = getScenarioNarrationText(snapshot.project, target);
    if (
      !saved ||
      saved.text !== target.text ||
      JSON.stringify(saved.narration) !== JSON.stringify(target.narration)
    )
      throw new Error('stale');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saved.text));
    const sourceTextHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    const scope: ScenarioSpeechScope = {
      workspaceId: snapshot.project.id,
      workspaceRevision: snapshot.workspaceRevision,
      target: { kind: 'scenario-text', slideId: target.slideId, objectId: target.objectId },
      sourceTextHash,
    };
    if ((await assertScenarioSpeechScope(scope)) !== saved.text) throw new Error('stale');
    captured.push({ scope, text: saved.text, expectedNarration: structuredClone(saved.narration) });
  }
  return captured;
}

/** Materializes temporary bytes before preview admission so serial Apply never rereads an old scope. */
export async function generateScenarioNarration(
  basis: ScenarioNarrationBasis,
  profile: AISpeechModelParameters & { modelId: string },
  approvedProviderId: string,
  signal: AbortSignal
): Promise<ScenarioNarrationPreview> {
  signal.throwIfAborted();
  if (!approvedProviderId || (await assertScenarioSpeechScope(basis.scope)) !== basis.text)
    throw new Error('stale');
  const { modelId, ...parameters } = structuredClone(profile);
  const result = await runReviewSpeechJob(
    {
      type: 'start',
      requestId: crypto.randomUUID(),
      operation: 'speech',
      scope: basis.scope,
      text: basis.text,
      modelId,
      approvedProviderId,
      profile: parameters,
    },
    { signal }
  );
  if (result.type !== 'audio') throw new Error('invalid-response');
  try {
    signal.throwIfAborted();
    const file = await readAudioStaging(result.staged, basis.scope);
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    signal.throwIfAborted();
    const context = new AudioContext();
    let duration: number;
    try {
      duration = (await context.decodeAudioData(await blob.arrayBuffer())).duration;
    } finally {
      await context.close();
    }
    signal.throwIfAborted();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
      throw new Error('decode-failed');
    if ((await assertScenarioSpeechScope(basis.scope)) !== basis.text) throw new Error('stale');
    signal.throwIfAborted();
    const url = URL.createObjectURL(blob);
    return { ...basis, blob, url, staged: result.staged, duration };
  } catch (error) {
    await discardAudioStaging(result.staged, basis.scope).catch(() => undefined);
    throw error;
  }
}

/** Only temporary resources are disposed; accepted ordinary Scenario resources have another owner. */
export async function cleanupScenarioNarrationPreview(
  preview: ScenarioNarrationPreview
): Promise<void> {
  URL.revokeObjectURL(preview.url);
  await discardAudioStaging(preview.staged, preview.scope);
}
