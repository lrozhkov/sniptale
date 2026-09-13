import { expect, it } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/public';
import { projectScenarioPrivacy } from './privacy';
import { createMediaHubBackupExportOptions } from './options';
it('applies source-metadata privacy to historical captures as well as the current guide', () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const step = createGuideStep('Captured', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 100,
      height: 50,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'manual',
        target: null,
        cursorPoint: null,
        interactionPoint: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'keyboard-enter' },
        page: {
          title: 'Private source title',
          url: 'https://private.test/path',
          viewport: { x: 0, y: 0, width: 100, height: 50 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
      },
    })
  );
  project.items.push(step);
  const source = step.blocks[0];
  if (source?.kind !== 'image') throw new Error('Expected image');
  if (source.source.kind === 'capture')
    source.source.page.url = 'https://user:password@private.test/path?secret=token#fragment';
  const image = {
    assetId: source.assetId,
    galleryAssetId: null,
    editDocumentId: null,
    width: 100,
    height: 50,
    alt: '',
    source: source.source,
  };
  const slide = createTourImageSlide('tour-image');
  slide.image = image;
  project.tour = createTourDocument('tour');
  project.tour.slides = [
    slide,
    {
      kind: 'navigation',
      id: 'navigation',
      title: '',
      description: '',
      background: { color: '#ffffff', image },
      buttons: [],
      narration: null,
      timing: slide.timing,
    },
  ];
  const entry = {
    id: project.id,
    createdAt: 1,
    updatedAt: 2,
    workspaceRevision: 2,
    project: { ...project, updatedAt: 2 },
    history: [{ revision: 1, savedAt: 1, project }],
  };
  const original = structuredClone(entry);
  const redacted = projectScenarioPrivacy(
    entry,
    createMediaHubBackupExportOptions({ includeSourceMetadata: false })
  );
  expect(JSON.stringify(redacted)).not.toContain('Private source title');
  expect(JSON.stringify(redacted)).not.toContain('private.test');
  expect(redacted.history?.[0]?.project.items).toHaveLength(1);
  expect(entry).toEqual(original);
  expect(
    JSON.stringify(projectScenarioPrivacy(entry, createMediaHubBackupExportOptions()))
  ).toContain('private.test');
  const included = JSON.stringify(
    projectScenarioPrivacy(entry, createMediaHubBackupExportOptions())
  );
  expect(included).not.toContain('password');
  expect(included).not.toContain('secret=');
  expect(included).not.toContain('#fragment');
});
