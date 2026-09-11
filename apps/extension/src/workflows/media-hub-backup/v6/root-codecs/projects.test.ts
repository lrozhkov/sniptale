import { describe, expect, it } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../../features/scenario/project/factories';
import { assertPortableJson } from '../codec';
import { encodePortableScenarioProjectEntry } from './projects';

describe('portable guide project codec', () => {
  it('encodes every image in a step and preserves repeated references and immutable annotation identity', () => {
    const project = createGuideProject('Portable', 'scenario', 1);
    const step = createGuideStep('Compare', 'step');
    step.blocks = ['first', 'second'].map((id) =>
      createGuideImageBlock({
        id,
        assetId: 'scenario-asset',
        editDocumentId: `document-${id}`,
        width: 100,
        height: 50,
        source: { kind: 'import', filename: `${id}.png` },
      })
    );
    project.items = [step];
    const original = structuredClone(project);
    const portable = encodePortableScenarioProjectEntry({
      createdAt: 1,
      id: project.id,
      project,
      updatedAt: 1,
      workspaceRevision: 2,
    });
    expect(() => assertPortableJson(portable)).not.toThrow();
    const serialized = JSON.stringify(portable);
    expect(serialized).not.toContain('"assetId"');
    expect(serialized.match(/"scenarioAssetId":"scenario-asset"/g)).toHaveLength(2);
    expect(serialized).toContain('"editDocumentId":"document-second"');
    expect(project).toEqual(original);
  });
});
