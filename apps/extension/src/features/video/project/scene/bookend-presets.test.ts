import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { applyVideoProjectMutationPatch } from '../mutation';
import { hydrateVideoProject } from '../hydration';
import { isHydratableVideoProject, isExportReadyVideoProject } from '../validation/root';
import { getProjectAssetUseCounts, getProjectAssetUses } from '../media-usage';
import { removeVideoProjectLibrarySources } from '../library-source-removal';
import {
  createVideoProjectBookendPresets,
  parseVideoProjectBookendPresets,
  selectVideoProjectBookendMaterial,
} from './bookend-presets';
import { createBookendImagePresentation, createBookendVideoPresentation } from './bookend-media';

function fixture() {
  const project = createEmptyVideoProject();
  const image = createVideoProjectAsset(
    'Card',
    'IMAGE',
    { kind: 'project-asset', projectAssetId: 'image-bytes' },
    {
      width: 641,
      height: 359,
      duration: null,
      mimeType: 'image/png',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const video = createVideoProjectAsset(
    'Movie',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'video-bytes' },
    {
      width: 641,
      height: 359,
      duration: 7200,
      mimeType: 'video/mp4',
      size: 1024 ** 3,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  project.assets = [image, video];
  const slot = {
    mode: 'none' as const,
    image: { ...createBookendImagePresentation(), assetId: image.id, duration: 7.3 },
    video: { ...createBookendVideoPresentation(7200), assetId: video.id },
  };
  const presets = { intro: slot, outro: structuredClone(slot) };
  return { project, image, video, presets };
}

describe('retained Native bookend recipes', () => {
  it('promotes only an explicit edit and preserves both dormant variants without writes on read', () => {
    const { project, presets } = fixture();
    expect(project.bookendPresets).toBeUndefined();
    const changed = applyVideoProjectMutationPatch(project, { bookendPresets: presets });
    expect(changed.version).toBe(25);
    expect(isHydratableVideoProject(changed)).toBe(true);
    expect(parseVideoProjectBookendPresets(changed.bookendPresets)).toEqual(presets);
    expect(hydrateVideoProject(changed).bookendPresets).toEqual(presets);
    expect(hydrateVideoProject(project).bookendPresets).toBeUndefined();
    const cleared = { ...changed };
    delete cleared.bookendPresets;
    expect(applyVideoProjectMutationPatch(cleared, {}).version).toBe(25);
    expect(isHydratableVideoProject({ ...changed, version: 24 })).toBe(false);
    expect(isHydratableVideoProject({ ...changed, version: Number.MAX_SAFE_INTEGER })).toBe(false);
  });

  it('protects all four remembered references even in None mode and with no visible clips', () => {
    const { project, image, video, presets } = fixture();
    const changed = applyVideoProjectMutationPatch(project, { bookendPresets: presets });
    expect([...getProjectAssetUseCounts(changed)]).toEqual([
      [image.id, 2],
      [video.id, 2],
    ]);
    expect(getProjectAssetUses(changed)).toEqual([
      { assetId: image.id, kind: 'bookend-preset', side: 'intro', variant: 'image' },
      { assetId: video.id, kind: 'bookend-preset', side: 'intro', variant: 'video' },
      { assetId: image.id, kind: 'bookend-preset', side: 'outro', variant: 'image' },
      { assetId: video.id, kind: 'bookend-preset', side: 'outro', variant: 'video' },
    ]);
  });

  it('refuses missing, wrong-kind and out-of-source remembered references', () => {
    const { project, image, video, presets } = fixture();
    const changed = applyVideoProjectMutationPatch(project, { bookendPresets: presets });
    expect(isExportReadyVideoProject({ ...changed, assets: [image] })).toBe(false);
    expect(isExportReadyVideoProject({ ...changed, assets: [video] })).toBe(false);
    expect(
      isExportReadyVideoProject({ ...changed, assets: [{ ...image, type: 'VIDEO' }, video] })
    ).toBe(false);
    expect(
      isExportReadyVideoProject({
        ...changed,
        assets: [image, { ...video, metadata: { ...video.metadata, duration: 60 } }],
      })
    ).toBe(false);
    expect(
      parseVideoProjectBookendPresets({ ...presets, unknown: { assetId: image.id } })
    ).toBeNull();
    expect(
      parseVideoProjectBookendPresets({
        ...presets,
        intro: { ...presets.intro, image: { ...presets.intro.image, hidden: true } },
      })
    ).toBeNull();
  });

  it('retains other variants and authored values when replacing a material', () => {
    const { image, video, presets } = fixture();
    const selectedImage = selectVideoProjectBookendMaterial(presets.intro, image);
    expect(selectedImage).toMatchObject({
      mode: 'image',
      image: { duration: 7.3 },
      video: presets.intro.video,
    });
    const selectedVideo = selectVideoProjectBookendMaterial(presets.intro, video);
    expect(selectedVideo).toMatchObject({
      mode: 'video',
      image: presets.intro.image,
      video: { trim: { start: 0, end: 7200 } },
    });
    expect(createVideoProjectBookendPresets()).toEqual({
      intro: { mode: 'none' },
      outro: { mode: 'none' },
    });
  });

  it('clears only confirmed exact source references and keeps the other remembered variant', () => {
    const { project, image, video, presets } = fixture();
    const changed = applyVideoProjectMutationPatch(project, { bookendPresets: presets });
    const removed = removeVideoProjectLibrarySources(changed, [image.source]);
    expect(removed.bookendPresets?.intro.image).toBeUndefined();
    expect(removed.bookendPresets?.outro.image).toBeUndefined();
    expect(removed.bookendPresets?.intro.video).toEqual(presets.intro.video);
    expect(removed.assets.map(({ id }) => id)).toEqual([video.id]);
    expect(removed.version).toBe(25);
    expect(isHydratableVideoProject(removed)).toBe(true);
    expect(changed.bookendPresets).toEqual(presets);
  });
});

it('admits shared transition recipes only in schema26 and keeps independent inactive settings on read', () => {
  const { project, presets } = fixture();
  const configured = {
    ...presets,
    introTransition: { type: 'dissolve' as const, before: 0.2, after: 0.3 },
    outroTransition: { type: 'fade-black' as const, before: 0.3, after: 0, color: '#abcdef' },
  };
  const next = applyVideoProjectMutationPatch(project, { bookendPresets: configured });
  expect(next.version).toBe(26);
  expect(isHydratableVideoProject(next)).toBe(true);
  expect(isHydratableVideoProject({ ...next, version: 25 })).toBe(false);
  expect(parseVideoProjectBookendPresets(next.bookendPresets)).toEqual(configured);
  expect(hydrateVideoProject(next).bookendPresets).toEqual(configured);
  expect(
    parseVideoProjectBookendPresets({
      ...configured,
      introTransition: { ...configured.introTransition, extra: true },
    })
  ).toBeNull();
  expect(project.bookendPresets).toBeUndefined();
});
