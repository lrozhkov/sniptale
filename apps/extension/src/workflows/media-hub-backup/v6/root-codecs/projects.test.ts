import { describe, expect, it } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../../features/scenario/project/factories';
import { assertPortableJson } from '../codec';
import {
  encodePortableScenarioProjectEntry,
  parsePortableScenarioProjectMetadata,
} from './projects';

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
it('encodes historical image references and rejects malformed or cross-project history', async () => {
  const { decodePortableScenarioHistory } = await import('./projects');
  const project = createGuideProject('Old', 'guide', 1);
  const step = createGuideStep('Old image', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'old-asset',
      editDocumentId: 'old-document',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'old.png' },
    })
  );
  project.items.push(step);
  const entry = {
    id: project.id,
    createdAt: 1,
    updatedAt: 2,
    workspaceRevision: 2,
    project: { ...project, updatedAt: 2, items: [] },
    history: [{ revision: 1, savedAt: 1, project }],
  };
  const encoded = encodePortableScenarioProjectEntry(entry);
  expect(JSON.stringify(encoded.history)).toContain('"scenarioAssetId":"old-asset"');
  expect(JSON.stringify(encoded.history)).toContain('"editDocumentId":"old-document"');
  expect(JSON.stringify(encoded.history)).not.toContain('"assetId"');
  expect(decodePortableScenarioHistory(encoded.history, 'guide')).toHaveLength(1);
  expect(() => decodePortableScenarioHistory(encoded.history, 'foreign')).toThrow();
  expect(() => decodePortableScenarioHistory([null], 'guide')).toThrow();
  expect(() =>
    decodePortableScenarioHistory(Array(51).fill(encoded.history?.[0]), 'guide')
  ).toThrow();
});

it('admits portable HTML bodies and refuses local pointers or malformed catalogue contracts', () => {
  const entry = encodePortableScenarioProjectEntry({
    id: 'guide',
    project: createGuideProject('Guide', 'guide', 1),
    createdAt: 1,
    updatedAt: 1,
    workspaceRevision: 1,
  });
  const row = {
    id: 'saved',
    projectId: 'guide',
    filename: 'saved.html',
    format: 'html',
    createdAt: 1,
    size: 4,
    html: { mode: 'tour', objectId: 'html-object' },
  };
  const value = { entry, assets: [], exports: [row], exportThumbnails: [], stepDocuments: [] };
  expect(parsePortableScenarioProjectMetadata(value).exports[0]).toEqual(row);
  for (const html of [
    { ...row.html, assetId: 'foreign-local' },
    { mode: 'other', objectId: 'html-object' },
    { mode: 'guide', objectId: '' },
  ]) {
    expect(() =>
      parsePortableScenarioProjectMetadata({ ...value, exports: [{ ...row, html }] })
    ).toThrow();
  }
  expect(() =>
    parsePortableScenarioProjectMetadata({ ...value, exports: [{ ...row, size: 0 }] })
  ).toThrow();
});
