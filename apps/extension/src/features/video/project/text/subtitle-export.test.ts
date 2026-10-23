import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectFromRecording } from '../factories/creation';
import { exportVideoProjectSubtitles } from './subtitle-export';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'clip.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Missing video');
  project.version = 5;
  project.textDocuments = [
    {
      id: 'source',
      binding: { kind: 'source', assetId: clip.assetId, sourceInstanceId: clip.sourceInstanceId },
      document: {
        version: 1,
        fragments: [
          {
            id: 'same-local-id',
            text: 'Привет',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            start: 2,
            end: 4,
            timeDomain: 'source',
            showInVideo: true,
            language: 'ru',
          },
        ],
      },
    },
    {
      id: 'project',
      binding: { kind: 'project' },
      document: {
        version: 1,
        fragments: [
          {
            id: 'same-local-id',
            text: 'Hello',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            alignment: 'manual',
            start: 3,
            end: 5,
            timeDomain: 'result',
            showInVideo: false,
            language: 'en',
          },
        ],
      },
    },
  ];
  return { project, clip };
}

it('exports whole-project times through the shared serializer after source move and speed', () => {
  const { project, clip } = fixture();
  clip.startTime = 1;
  clip.playbackRate = 2;
  clip.duration = 5;
  const result = exportVideoProjectSubtitles(project, { format: 'vtt' });
  if (!result.ok) throw new Error(result.reason);
  expect(result.text).toContain('00:00:02.000 --> 00:00:03.000\nПривет');
  expect(result.text).toContain('00:00:03.000 --> 00:00:05.000\nHello');
  expect(result.count).toBe(2);
});

it('preserves explicit language, visibility and overlap options without editing the document', () => {
  const { project } = fixture();
  const before = structuredClone(project);
  const shown = exportVideoProjectSubtitles(project, { format: 'srt', onlyShown: true });
  expect(shown.ok && shown.count).toBe(1);
  const russian = exportVideoProjectSubtitles(project, { format: 'srt', language: 'ru' });
  expect(russian.ok && russian.text).not.toContain('Hello');
  const normalized = exportVideoProjectSubtitles(project, {
    format: 'srt',
    normalizeOverlaps: true,
  });
  expect(normalized.ok && normalized.normalized).toBe(true);
  expect(project).toEqual(before);
});

it('exports no invented cues when a source is dormant or a project has no text', () => {
  const { project } = fixture();
  project.clips = [];
  const result = exportVideoProjectSubtitles(project, { format: 'vtt', language: 'ru' });
  expect(result.ok && result.count).toBe(0);
  expect(exportVideoProjectSubtitles(createEmptyVideoProject(), { format: 'srt' }).ok).toBe(true);
});

it('reports sub-millisecond omissions without discarding other authored cues', () => {
  const { project } = fixture();
  const fragments = project.textDocuments![1]!.document.fragments;
  fragments[0]!.start = 1.0001;
  fragments[0]!.end = 1.0002;
  const before = structuredClone(project);
  const result = exportVideoProjectSubtitles(project, { format: 'srt' });
  expect(result).toMatchObject({ ok: true, count: 1, excluded: 1 });
  expect(project).toEqual(before);
});

it.each(['srt', 'vtt'] as const)(
  'retains transferred caption limits in %s after reopen',
  async (format) => {
    const { parseHydratableVideoProject } = await import('../validation/root');
    const { project } = fixture();
    project.version = 45;
    const entry = project.textDocuments![1]!;
    const fragment = entry.document.fragments[0]!;
    fragment.start = 6;
    fragment.end = 8;
    fragment.text = 'Partial tail';
    entry.document.fragments.push({
      ...fragment,
      id: 'hidden',
      start: 8,
      end: 9,
      text: 'Hidden tail',
    });
    entry.resultEndLimits = [
      { fragmentId: fragment.id, end: 7 },
      { fragmentId: 'hidden', end: 7 },
    ];
    const reopened = parseHydratableVideoProject(JSON.parse(JSON.stringify(project)));
    expect(reopened).not.toBeNull();
    if (!reopened) throw new Error('Project was not admitted');
    const before = structuredClone(reopened);
    const result = exportVideoProjectSubtitles(reopened, { format });
    expect(result).toMatchObject({ ok: true, count: 2, excluded: 2 });
    if (!result.ok) throw new Error(result.reason);
    const separator = format === 'srt' ? ',' : '.';
    expect(result.text).toContain(
      `00:00:06${separator}000 --> 00:00:07${separator}000\nPartial tail`
    );
    expect(result.text).not.toContain('Hidden tail');
    expect(result.text).toContain('Привет');
    expect(reopened).toEqual(before);
    expect(reopened.textDocuments).toEqual(project.textDocuments);
  }
);
