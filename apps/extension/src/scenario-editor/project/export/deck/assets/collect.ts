import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export function collectScenarioDeckAssetIds(project: ScenarioProjectV3): string[] {
  const ids = new Set<string>();

  for (const slide of project.slides) {
    for (const element of slide.elements) {
      if (element.kind === 'image') {
        ids.add(element.assetRef.assetId);
      }
    }
  }

  return [...ids];
}
