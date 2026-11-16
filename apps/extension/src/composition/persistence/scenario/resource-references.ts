import { getScenarioResourceReferences } from '../../../features/scenario/project/public';
import type { ScenarioProjectEntry } from './contracts';

/** Collect dependencies from one admitted current, saved-version and editing history graph. */
export function collectScenarioResourceReferences(entry: ScenarioProjectEntry) {
  const assets = new Set<string>();
  const documents = new Set<string>();
  const projects = new Set([
    entry.project,
    ...(entry.history ?? []).map((version) => version.project),
    ...(entry.editingHistory?.past ?? []),
    ...(entry.editingHistory?.future ?? []),
  ]);
  for (const project of projects) {
    const references = getScenarioResourceReferences(project);
    for (const id of references.assets) assets.add(id);
    for (const id of references.documents) documents.add(id);
  }
  return { assets, documents };
}
