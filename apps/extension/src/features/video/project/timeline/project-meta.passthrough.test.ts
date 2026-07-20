import { describe, expect, it, vi } from 'vitest';
import { isSimplePassthroughProject } from './meta';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectExportSettings,
} from '../types/index';
import {
  createAudioClip,
  createProject,
  createTextClip,
  createTransform,
  createVideoClip,
} from './project-meta.test.helpers.ts';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createBaseSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function expectPassthroughRejects(
  projectFactory: () => ReturnType<typeof createProject>,
  settings = createBaseSettings()
): void {
  expect(isSimplePassthroughProject(projectFactory(), settings)).toBe(false);
}

describe('video project meta passthrough detection', () => {
  it('accepts a simple passthrough video project with matching settings', () => {
    const project = createProject([createVideoClip(), createAudioClip()]);

    expect(isSimplePassthroughProject(project, createBaseSettings())).toBe(true);
  });

  it('rejects projects with incompatible clip counts or non-video visual clips', () => {
    expectPassthroughRejects(() =>
      createProject([createVideoClip(), createVideoClip({ id: 'clip-2', startTime: 1 })])
    );
    expectPassthroughRejects(() => createProject([createTextClip()]));
  });

  it('rejects passthrough when an enabled EffectV1 instance changes exported output', () => {
    const project = createProject([createVideoClip(), createAudioClip()]);
    project.effectInstances = [
      {
        controls: {},
        duration: 8,
        enabled: true,
        id: 'effect-instance-1',
        kind: 'targetEffect',
        playbackRate: 1,
        snapshotId: 'effect-snapshot-1',
        startTime: 0,
        target: { clipId: 'clip-video', kind: 'clip' },
      },
    ];

    expect(isSimplePassthroughProject(project, createBaseSettings())).toBe(false);
    project.effectInstances[0] = { ...project.effectInstances[0]!, enabled: false };
    expect(isSimplePassthroughProject(project, createBaseSettings())).toBe(true);
  });
});

it(
  'rejects projects with incompatible transforms, audio pairing, or export size',
  verifyPassthroughGuardrails
);

it('rejects projects whose export height no longer matches the source video', () => {
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    height: 1080,
  });
});

it('rejects muted or hidden audio pairs and allows video-only passthrough clips', () => {
  expectPassthroughRejects(() =>
    createProject([createVideoClip(), createAudioClip({ muted: true })])
  );
  expectPassthroughRejects(() => {
    const project = createProject([createVideoClip(), createAudioClip()]);
    project.tracks = project.tracks.map((track) =>
      track.kind === 'AUDIO' ? { ...track, visible: false } : track
    );
    return project;
  });
  expect(isSimplePassthroughProject(createProject([createVideoClip()]), createBaseSettings())).toBe(
    true
  );
});

it('rejects audio pairs whose timing or media metadata drift from the visual clip', () => {
  expectPassthroughRejects(() =>
    createProject([createVideoClip(), createAudioClip({ startTime: 0.25 })])
  );
  expectPassthroughRejects(() =>
    createProject([createVideoClip(), createAudioClip({ sourceStart: 0.5 })])
  );
  expectPassthroughRejects(() =>
    createProject([createVideoClip(), createAudioClip({ duration: 3.8, sourceDuration: 3.8 })])
  );
});

it('rejects selected-range and subtitle-oriented export variants', () => {
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    scope: 'selected-clip',
  });
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    burnInSubtitles: true,
  });
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    subtitleSidecarFormats: ['srt'],
  });
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    rangeStartSeconds: 1,
  });
});

function verifyPassthroughGuardrails() {
  expectPassthroughRejects(() =>
    createProject([
      createVideoClip({ transform: { ...createTransform(), x: 10 } }),
      createAudioClip(),
    ])
  );
  expectPassthroughRejects(() =>
    createProject([createVideoClip(), createAudioClip({ assetId: 'asset-audio' })])
  );
  expectPassthroughRejects(() =>
    createProject([createVideoClip({ playbackRate: 1.5 }), createAudioClip()])
  );
  expectPassthroughRejects(() => createProject([createVideoClip()]), {
    ...createBaseSettings(),
    width: 1920,
  });
}
