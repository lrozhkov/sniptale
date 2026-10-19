import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { getVideoProjectActionPresentation } from '../action-presentation';
import { isHydratableVideoProject } from './root';
import { createCameraFollowSettings } from '../camera/cursor-policy';
import { createVideoProjectMotionRegion } from '../motion';
import { applyVideoProjectMutationPatch } from '../mutation';

it('validates presentation defaults at the project boundary', () => {
  const project = createEmptyVideoProject('History');
  const defaults = getVideoProjectActionPresentation(project);
  expect(isHydratableVideoProject({ ...project, actionPresentation: defaults })).toBe(true);
  for (const patch of [
    { enabled: 'yes' },
    { duration: 0 },
    { duration: Infinity },
    { offset: NaN },
    { clickSuppressionInterval: -1 },
    { clickPreset: 'unknown' },
    { showKeystrokes: 1 },
  ]) {
    expect(
      isHydratableVideoProject({ ...project, actionPresentation: { ...defaults, ...patch } })
    ).toBe(false);
  }
  expect(isHydratableVideoProject({ ...project, actionPresentation: null })).toBe(false);
});

it('admits complete camera policy only at version four and preserves it across project mutations', () => {
  const project = createEmptyVideoProject('Camera policy');
  const cameraFollowDefaults = createCameraFollowSettings('calm');
  const cameraFollow = createCameraFollowSettings('fast');
  const motionRegions = [{ ...createVideoProjectMotionRegion(project, 0), cameraFollow }];
  const changed = applyVideoProjectMutationPatch(project, { cameraFollowDefaults, motionRegions });
  expect(changed.version).toBe(4);
  expect(isHydratableVideoProject(changed)).toBe(true);
  expect(isHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toBe(true);
  expect(isHydratableVideoProject({ ...changed, version: 3 })).toBe(false);
  expect(
    isHydratableVideoProject({
      ...changed,
      cameraFollowDefaults: { ...cameraFollowDefaults, zoneSize: NaN },
    })
  ).toBe(false);
  const renamed = applyVideoProjectMutationPatch(changed, { name: 'Renamed' });
  expect(renamed.version).toBe(4);
  expect(renamed.cameraFollowDefaults).toEqual(cameraFollowDefaults);
  expect(renamed.motionRegions).toEqual(motionRegions);
});

it('admits source-bound authored text only in version five and preserves dormant text', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { parseHydratableVideoProject, isExportReadyVideoProject } = await import('./root');
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'capture.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Missing source instance');
  const changed = applyVideoProjectMutationPatch(project, {
    textDocuments: [
      {
        id: 'speech',
        binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId },
        document: {
          version: 1,
          fragments: [
            {
              id: 'phrase',
              text: 'Hidden by a trim',
              originalText: 'Recognized',
              revision: 1,
              timingRevision: 0,
              start: 1,
              end: 3,
              alignment: 'manual',
              timeDomain: 'source',
              showInVideo: true,
            },
          ],
        },
      },
    ],
  });
  expect(changed.version).toBe(5);
  expect(isHydratableVideoProject({ ...changed, version: 6 })).toBe(true);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  for (const version of [2, 3, 4, 17])
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  expect(applyVideoProjectMutationPatch(changed, { name: 'Renamed' }).version).toBe(5);
  expect(isExportReadyVideoProject({ ...changed, clips: [] })).toBe(true);
  expect(isExportReadyVideoProject({ ...changed, assets: [] })).toBe(false);
  const binding = changed.textDocuments![0]!.binding;
  if (binding.kind !== 'source') throw new Error('Missing source binding');
  expect(
    isExportReadyVideoProject({
      ...changed,
      textDocuments: [
        { ...changed.textDocuments![0]!, binding: { ...binding, assetId: 'foreign' } },
      ],
    })
  ).toBe(false);
});

it('fences camera reflection at schema eight and retains the version after removal', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { parseHydratableVideoProject, isExportReadyVideoProject } = await import('./root');
  const project = createVideoProjectFromRecording({
    recordingId: 'mirror',
    filename: 'camera.webm',
    width: 160,
    height: 90,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  for (const mirrored of [true, false]) {
    const changed = applyVideoProjectMutationPatch(project, {
      clips: project.clips.map((clip) =>
        clip.type === 'VIDEO' ? { ...clip, cameraMirrored: mirrored } : clip
      ),
    });
    expect(changed.version).toBe(8);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
    expect(isExportReadyVideoProject(changed)).toBe(true);
    for (const version of [2, 3, 4, 5, 6, 7, 17])
      expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
    expect(applyVideoProjectMutationPatch(changed, { clips: [] }).version).toBe(8);
  }
  for (const version of [2, 3, 4, 5, 6, 7, 8])
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
});

it('admits authored media shadow colors only in schema nine without writing defaults', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { parseHydratableVideoProject, isExportReadyVideoProject } = await import('./root');
  const project = createVideoProjectFromRecording({
    recordingId: 'shadow',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  for (const shadowColor of ['#ff008080', 'rgba(20, 40, 80, 0.5)', 'transparent']) {
    const changed = applyVideoProjectMutationPatch(project, {
      clips: project.clips.map((clip) => (clip.type === 'VIDEO' ? { ...clip, shadowColor } : clip)),
    });
    expect(changed.version).toBe(9);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
    expect(isExportReadyVideoProject(changed)).toBe(true);
    for (const version of [2, 3, 4, 5, 6, 7, 8, 17])
      expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
    expect(applyVideoProjectMutationPatch(changed, { clips: [] }).version).toBe(9);
  }
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const parsed = parseHydratableVideoProject({ ...project, version });
    expect(parsed).not.toBeNull();
    expect(parsed?.clips.some((clip) => 'shadowColor' in clip)).toBe(false);
  }
  const clip = project.clips[0]!;
  for (const shadowColor of [
    null,
    4,
    '',
    'url(https://invalid.test)',
    '#zzzzzz',
    'red'.repeat(1000),
  ])
    expect(
      isHydratableVideoProject({ ...project, version: 9, clips: [{ ...clip, shadowColor }] })
    ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      version: 9,
      clips: [{ ...clip, type: 'AUDIO', shadowColor: '#ff0000' }],
    })
  ).toBe(false);
});

it('fences circle at schema ten and retains dormant camera settings without opening writes', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { DEFAULT_CAMERA_APPEARANCE } = await import('../camera/appearance');
  const { parseHydratableVideoProject, isExportReadyVideoProject } = await import('./root');
  const project = createVideoProjectFromRecording({
    recordingId: 'circle',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip) throw new Error('Missing video');
  const cameraAppearance = {
    ...DEFAULT_CAMERA_APPEARANCE,
    shape: 'circle' as const,
    roundness: 61,
  };
  const changed = applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      item.id === clip.id ? { ...clip, cameraAppearance } : item
    ),
  });
  expect(changed.version).toBe(10);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9, 17])
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const parsed = parseHydratableVideoProject({ ...project, version });
    expect(parsed).not.toBeNull();
    expect(parsed?.clips[0]).not.toHaveProperty('cameraAppearance');
  }
  for (const type of ['IMAGE', 'AUDIO'])
    expect(
      isHydratableVideoProject({ ...changed, clips: [{ ...clip, type, cameraAppearance }] })
    ).toBe(false);
  expect(applyVideoProjectMutationPatch(changed, { clips: [] }).version).toBe(10);
});

it('fences positional camera crops at schema eleven and keeps inherited data absent', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { parseHydratableVideoProject, isExportReadyVideoProject } = await import('./root');
  const project = createVideoProjectFromRecording({
    recordingId: 'position-crop',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 6,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  const position = {
    id: 'crop',
    sourceTime: 2,
    transform: { ...clip.transform },
    fitMode: clip.fitMode,
    transition: { kind: 'instant' as const, duration: 0 },
  };
  const crop = { zoom: 2, panX: 0.5, panY: -0.5 };
  const changed = applyVideoProjectMutationPatch(project, {
    clips: [{ ...clip, cameraPositions: [{ ...position, crop }] }],
  });
  expect(changed.version).toBe(11);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  expect(isExportReadyVideoProject(changed)).toBe(true);
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9, 10, 17])
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  for (const version of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    const parsed = parseHydratableVideoProject({
      ...project,
      version,
      clips: [{ ...clip, cameraPositions: [position] }],
    });
    expect(parsed).not.toBeNull();
    const camera = parsed?.clips[0];
    if (camera?.type !== 'VIDEO') throw new Error('Expected video');
    expect(camera.cameraPositions![0]).not.toHaveProperty('crop');
    expect(camera).not.toHaveProperty('cameraAppearance');
  }
  for (const invalid of [
    null,
    {},
    { ...crop, zoom: 0 },
    { ...crop, zoom: Infinity },
    { ...crop, panX: 2 },
    { ...crop, panY: NaN },
  ])
    expect(
      isHydratableVideoProject({
        ...changed,
        clips: [{ ...clip, cameraPositions: [{ ...position, crop: invalid }] }],
      })
    ).toBe(false);
  for (const type of ['IMAGE', 'AUDIO'])
    expect(
      isHydratableVideoProject({
        ...changed,
        clips: [{ ...clip, type, cameraPositions: [{ ...position, crop }] }],
      })
    ).toBe(false);
  expect(
    applyVideoProjectMutationPatch(changed, { clips: [{ ...clip, cameraPositions: [position] }] })
      .version
  ).toBe(11);
});

it.each([1, 2.5, 16.5, 17, NaN, Infinity, '12', null, undefined])(
  'refuses unsupported or malformed schema version %j',
  (version) => {
    expect(isHydratableVideoProject({ ...createEmptyVideoProject('Version'), version })).toBe(
      false
    );
  }
);

it('fences per-media source crop at schema thirteen and retains the version after reset', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const project = createVideoProjectFromRecording({
    recordingId: 'crop',
    filename: 'crop.webm',
    width: 640,
    height: 360,
    duration: 3,
    mimeType: 'video/webm',
    size: 100,
  });
  const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
  const clips = project.clips.map((clip) =>
    clip.type === 'VIDEO' ? { ...clip, sourceCrop: crop } : clip
  );
  const changed = applyVideoProjectMutationPatch(project, { clips });
  expect(changed.version).toBe(13);
  expect(isHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toBe(true);
  for (let version = 2; version <= 12; version++)
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  expect(isHydratableVideoProject({ ...changed, version: 17 })).toBe(false);
  for (const sourceCrop of [
    null,
    [],
    {},
    { ...crop, x: -0.1 },
    { ...crop, width: 0 },
    { ...crop, height: Infinity },
    { ...crop, x: 0.6 },
  ]) {
    expect(
      isHydratableVideoProject({
        ...changed,
        clips: clips.map((clip) => ({ ...clip, sourceCrop })),
      })
    ).toBe(false);
  }
  const removed = applyVideoProjectMutationPatch(changed, { clips: project.clips });
  expect(removed.version).toBe(13);
  expect(isHydratableVideoProject(removed)).toBe(true);
  const before = structuredClone(project);
  for (let version = 2; version <= 13; version++)
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
  expect(project).toEqual(before);
});

it('fences decorated window radius at schema fifteen without rewriting old projects', async () => {
  const { createVideoProjectFromRecording } = await import('../factories/creation');
  const { isVideoProjectClip } = await import('./clips');
  const project = createVideoProjectFromRecording({
    recordingId: 'radius',
    filename: 'radius.webm',
    width: 640,
    height: 360,
    duration: 3,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  for (const radius of [0, 12.5, 4096]) {
    const changed = applyVideoProjectMutationPatch(project, {
      clips: project.clips.map((item) =>
        item.id === clip.id ? { ...clip, windowCornerRadius: radius } : item
      ),
    });
    expect(changed.version).toBe(15);
    expect(isHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toBe(true);
    for (let version = 2; version <= 14; version++)
      expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
    expect(isHydratableVideoProject({ ...changed, version: 17 })).toBe(false);
    expect(applyVideoProjectMutationPatch(changed, { clips: project.clips }).version).toBe(15);
  }
  for (const radius of [null, '12', NaN, Infinity, -1, 4096.01, {}, []])
    expect(isVideoProjectClip({ ...clip, windowCornerRadius: radius })).toBe(false);
  const audio = { ...clip, type: 'AUDIO' };
  expect(isVideoProjectClip(audio)).toBe(true);
  expect(isVideoProjectClip({ ...audio, windowCornerRadius: 1 })).toBe(false);
  const before = structuredClone(project);
  for (let version = 2; version <= 15; version++)
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
  expect(project).toEqual(before);
});
