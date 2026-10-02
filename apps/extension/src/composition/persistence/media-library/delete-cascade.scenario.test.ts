import { expect, it } from 'vitest';
import { mediaId, physicalId, mediaEntry, rows, replaceRows } from './delete-cascade.test-support';
import {
  deleteMediaAssetWithProjectCascade,
  StaleMediaAssetDeletePreviewError,
} from './delete-cascade';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createScenarioProjectEntry } from '../scenario/projects/entry';

it.each([false, true])(
  'removes canonical scenario placement after root byte replacement=%s',
  async (replaced) => {
    const childPhysicalId = replaced ? 'frozen-old' : physicalId;
    const childId = 'scenario-child-1';
    const scenarioId = 'scenario-1';
    const project = createGuideProject('Guide', scenarioId, 1);
    const step = createGuideStep('Step', 'step-1');
    step.blocks.push(
      createGuideImageBlock({
        id: 'block-1',
        assetId: childId,
        width: 100,
        height: 100,
        source: { kind: 'import', filename: 'image.png' },
      })
    );
    project.items.push(step);
    const entry = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 1 });
    const scenarioMediaId = `scenario-asset:${childId}`;
    replaceRows(
      new Map<string, Map<string, unknown>>([
        [
          'media_library',
          new Map([
            [
              scenarioMediaId,
              {
                ...mediaEntry(),
                id: scenarioMediaId,
                kind: 'image',
                mimeType: 'image/png',
                source: { kind: 'stored-asset', assetId: physicalId },
              },
            ],
          ]),
        ],
        ['scenario_projects', new Map([[scenarioId, entry]])],
        [
          'scenario_assets',
          new Map([
            [
              childId,
              {
                id: childId,
                projectId: scenarioId,
                assetId: childPhysicalId,
                galleryAssetId: null,
                mimeType: 'image/png',
                width: 100,
                height: 100,
                createdAt: 1,
                size: 5,
              },
            ],
          ]),
        ],
        [
          'asset_owners',
          new Map([
            [
              JSON.stringify(['scenario-asset', childId, 'body']),
              {
                assetId: childPhysicalId,
                ownerId: childId,
                ownerKind: 'scenario-asset',
                role: 'body',
              },
            ],
            [
              JSON.stringify(['media-library', scenarioMediaId, 'source']),
              {
                assetId: physicalId,
                ownerId: scenarioMediaId,
                ownerKind: 'media-library',
                role: 'source',
              },
            ],
          ]),
        ],
        [
          'asset_refs',
          new Map([
            [
              physicalId,
              {
                assetId: physicalId,
                size: 5,
                mimeType: 'image/png',
                createdAt: 1,
                storagePath: 'object',
              },
            ],
          ]),
        ],
      ])
    );

    if (replaced)
      rows.get('asset_refs')!.set(childPhysicalId, {
        assetId: childPhysicalId,
        size: 5,
        mimeType: 'image/png',
        createdAt: 1,
        storagePath: 'old-object',
      });

    await deleteMediaAssetWithProjectCascade(scenarioMediaId, [
      { id: scenarioId, kind: 'scenario', name: 'Guide', primary: false },
    ]);
    const saved = rows.get('scenario_projects')!.get(scenarioId) as typeof entry;
    expect(saved.project.items[0]).toMatchObject({ blocks: [{ kind: 'image-slot' }] });
    expect(rows.get('scenario_assets')?.has(childId)).toBe(false);
    expect(rows.get('media_library')?.has(scenarioMediaId)).toBe(false);
    expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
    expect(rows.get('asset_refs')?.has(childPhysicalId)).toBe(false);
  }
);

it.each([
  { confirmed: true, source: 'screenshot' },
  { confirmed: false, source: 'screenshot' },
  { confirmed: true, source: 'project-asset' },
  { confirmed: false, source: 'project-asset' },
])(
  'requires a current warning to delete an active private $source Library import (confirmed=$confirmed)',
  async ({ confirmed, source }) => {
    if (source === 'screenshot') {
      const root = rows.get('media_library')!.get(mediaId) as object;
      rows.get('media_library')!.set(mediaId, {
        ...root,
        source: { kind: 'screenshot' },
        kind: 'image',
        mimeType: 'image/png',
        blob: new Blob(['png']),
      });
    }
    rows.get('video_projects')!.clear();
    const project = createGuideProject('Guide', 'scenario-private', 1);
    const step = createGuideStep('Step', 'step-private');
    step.blocks.push(
      createGuideImageBlock({
        id: 'block-private',
        assetId: 'private-child',
        galleryAssetId: mediaId,
        width: 100,
        height: 100,
        source: { kind: 'import', filename: 'image.png' },
      })
    );
    project.items.push(step);
    const entry = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 1 });
    rows.set('scenario_projects', new Map([[project.id, entry]]));
    rows.set(
      'scenario_assets',
      new Map([
        [
          'private-child',
          {
            id: 'private-child',
            projectId: project.id,
            assetId: 'private-object',
            galleryAssetId: mediaId,
            mimeType: 'image/png',
            width: 100,
            height: 100,
            size: 5,
            createdAt: 1,
          },
        ],
      ])
    );
    rows.get('asset_refs')!.set('private-object', {
      assetId: 'private-object',
      size: 5,
      mimeType: 'image/png',
      createdAt: 1,
      storagePath: 'private',
    });
    rows.get('asset_owners')!.set(JSON.stringify(['scenario-asset', 'private-child', 'body']), {
      assetId: 'private-object',
      ownerId: 'private-child',
      ownerKind: 'scenario-asset',
      role: 'body',
    });
    if (!confirmed) {
      await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toBeInstanceOf(
        StaleMediaAssetDeletePreviewError
      );
      expect(rows.get('media_library')?.has(mediaId)).toBe(true);
      expect(rows.get('scenario_assets')?.has('private-child')).toBe(true);
      expect(rows.get('asset_refs')?.has('private-object')).toBe(true);
      expect(rows.get('scenario_projects')!.get(project.id)).toEqual(entry);
      return;
    }
    await deleteMediaAssetWithProjectCascade(mediaId, [
      { id: project.id, kind: 'scenario', name: project.name, primary: false },
    ]);
    expect(rows.get('media_library')?.has(mediaId)).toBe(false);
    expect(rows.get('scenario_assets')?.has('private-child')).toBe(false);
    expect(rows.get('asset_refs')?.has('private-object')).toBe(false);
    const saved = rows.get('scenario_projects')!.get(project.id) as typeof entry;
    expect(saved.project.items[0]).toMatchObject({ blocks: [{ kind: 'image-slot' }] });
  }
);

it.each([mediaId, undefined, 42])(
  'retains media when invalid child provenance cannot prove disjointness: %j',
  async (galleryAssetId) => {
    rows.get('video_projects')!.clear();
    rows.set(
      'scenario_assets',
      new Map([
        [
          'invalid',
          {
            id: 'invalid',
            assetId: 'private-object',
            galleryAssetId,
          },
        ],
      ])
    );
    await expect(deleteMediaAssetWithProjectCascade(mediaId, [])).rejects.toMatchObject({
      reason: 'invalid-graph',
      graphDomain: 'scenario-asset',
    });
    expect(rows.get('media_library')?.has(mediaId)).toBe(true);
  }
);

it('removes a published audio resource, narration and history on direct permanent deletion', async () => {
  rows.get('video_projects')!.clear();
  const project = createGuideProject('Audio guide', 'audio-scenario', 1);
  const tour = createTourDocument('audio-tour');
  const slide = createTourImageSlide('audio-slide');
  slide.narration = {
    assetId: 'audio-child',
    duration: 2,
    trimStart: 0,
    trimEnd: 2,
    gain: 1,
    transcript: '',
  };
  tour.slides = [slide];
  tour.audioResources = [{ assetId: 'audio-child', duration: 2, name: 'Voice' }];
  project.tour = tour;
  const first = createScenarioProjectEntry({ existing: undefined, project, updatedAt: 1 });
  const entry = createScenarioProjectEntry({
    existing: first,
    project: { ...project, name: 'Current audio guide' },
    updatedAt: 2,
  });
  const audioMediaId = 'scenario-asset:audio-child';
  rows.get('media_library')!.clear();
  rows.get('media_library')!.set(audioMediaId, {
    ...mediaEntry(),
    id: audioMediaId,
    kind: 'audio',
    mimeType: 'audio/wav',
    width: null,
    height: null,
    source: { kind: 'stored-asset', assetId: physicalId },
  });
  rows.get('project_assets')!.clear();
  rows.get('asset_owners')!.clear();
  rows.get('asset_owners')!.set(JSON.stringify(['scenario-asset', 'audio-child', 'body']), {
    assetId: physicalId,
    ownerId: 'audio-child',
    ownerKind: 'scenario-asset',
    role: 'body',
  });
  rows.set('scenario_projects', new Map([[project.id, entry]]));
  rows.set(
    'scenario_assets',
    new Map([
      [
        'audio-child',
        {
          id: 'audio-child',
          projectId: project.id,
          assetId: physicalId,
          galleryAssetId: null,
          mimeType: 'audio/wav',
          duration: 2,
          width: 0,
          height: 0,
          size: 5,
          createdAt: 1,
        },
      ],
    ])
  );
  await deleteMediaAssetWithProjectCascade(audioMediaId, [
    { id: project.id, kind: 'scenario', name: entry.project.name, primary: false },
  ]);
  expect(rows.get('media_library')?.has(audioMediaId)).toBe(false);
  expect(rows.get('scenario_assets')?.has('audio-child')).toBe(false);
  expect(rows.get('asset_refs')?.has(physicalId)).toBe(false);
  const saved = rows.get('scenario_projects')!.get(project.id) as typeof entry;
  expect(saved.history?.length).toBeGreaterThan(0);
  for (const content of [
    saved.project,
    ...(saved.history ?? []).map((version) => version.project),
  ]) {
    expect(content.tour?.audioResources).toEqual([]);
    expect(content.tour?.slides[0]?.narration).toBeNull();
  }
});
