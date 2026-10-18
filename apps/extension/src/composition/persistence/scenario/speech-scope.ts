import type { ScenarioSpeechScope } from '../../../contracts/ai/audio';
import { getScenarioNarrationText } from '../../../features/scenario/project/public';
import { readScenarioViewingSnapshot } from './projects/viewing';

/** Checks the saved source without publication recovery or editor writes. */
export async function assertScenarioSpeechScope(scope: ScenarioSpeechScope): Promise<string> {
  const snapshot = await readScenarioViewingSnapshot(scope.workspaceId);
  if (
    !snapshot ||
    snapshot.project.id !== scope.workspaceId ||
    snapshot.revision !== scope.workspaceRevision
  )
    throw new Error('Stale Scenario speech scope.');
  const target = getScenarioNarrationText(snapshot.project, scope.target);
  if (!target) throw new Error('Stale Scenario speech target.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(target.text));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  if (hash !== scope.sourceTextHash) throw new Error('Stale Scenario speech source.');
  return target.text;
}
