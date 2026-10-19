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
  for (const version of [2, 3, 4, 9])
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
    for (const version of [2, 3, 4, 5, 6, 7, 9])
      expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
    expect(applyVideoProjectMutationPatch(changed, { clips: [] }).version).toBe(8);
  }
  for (const version of [2, 3, 4, 5, 6, 7, 8])
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
});
