import { expect, it } from 'vitest';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../../../features/scenario/project/public';
import { createMediaHubBackupExportOptions } from '../options';
import { MAX_ROOT_METADATA_BYTES } from '../contracts';
import { parsePortableScenarioProjectMetadata } from '../root-codecs/projects';
import { buildScenarioProjectRootInventory } from './scenario-projects';
it('exports large saved history as a separate bounded object without inflating root metadata', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const step = createGuideStep('Text', 'step');
  step.blocks.push({
    kind: 'text',
    id: 'text',
    paragraphs: createGuideParagraphs(Array(30).fill('x'.repeat(10_000)).join('\n')),
  });
  project.items.push(step);
  const entry = {
    id: project.id,
    project: { ...project, updatedAt: 21 },
    createdAt: 1,
    updatedAt: 21,
    workspaceRevision: 21,
    history: Array.from({ length: 20 }, (_, index) => ({
      revision: index + 1,
      savedAt: index + 1,
      project: { ...project, updatedAt: index + 1 },
    })),
  };
  const roots = await buildScenarioProjectRootInventory({
    db: {
      get: async () => undefined,
      getAll: async (name) => (name === 'scenario_projects' ? [entry] : []),
      getAllFromIndex: async () => [],
    },
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const envelope = await roots[0]?.load();
  if (!envelope) throw new Error('Missing root');
  const metadata = parsePortableScenarioProjectMetadata(envelope.metadata);
  expect(new TextEncoder().encode(JSON.stringify(metadata)).byteLength).toBeLessThan(
    MAX_ROOT_METADATA_BYTES
  );
  expect(metadata.entry).not.toHaveProperty('history');
  const object = envelope.objects.find((item) => item.ref.objectId === metadata.historyObjectId);
  if (!object) throw new Error('Missing history object');
  expect(object.blob.size).toBeGreaterThan(MAX_ROOT_METADATA_BYTES);
  const history: unknown = JSON.parse(await object.blob.text());
  expect(history).toHaveLength(20);
  expect(object.ref.mimeType).toBe('application/json');
});
