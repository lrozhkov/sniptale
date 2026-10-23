import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { createVideoProjectCaptionRenderer } from './project-captions';

function setup() {
  const load = vi.fn(async () => [{ status: 'loaded' }]);
  const measureText = vi.fn((text: string) => ({ width: text.length * 6 }));
  vi.stubGlobal('document', {
    fonts: { load },
    createElement: () => ({ width: 1, height: 1, getContext: () => ({ measureText }) }),
  });
  const project = createEmptyVideoProject('Captions');
  project.duration = 5;
  project.textDocuments = [
    {
      id: 'doc',
      binding: { kind: 'project' },
      captions: { ...createReviewCaptionSettings(), enabled: true },
      document: {
        version: 1,
        fragments: [
          {
            id: 'text',
            text: 'Visible',
            originalText: 'Visible',
            start: 0,
            end: 5,
            timeDomain: 'result',
            alignment: 'manual',
            revision: 0,
            timingRevision: 0,
            showInVideo: true,
          },
        ],
      },
    },
  ];
  return { load, measureText, project, renderer: createVideoProjectCaptionRenderer() };
}
const output = { width: 640, height: 360 };
afterEach(() => vi.unstubAllGlobals());
it('reuses a completed plan across frames and invalidates on project or output change', async () => {
  const { renderer, load, measureText, project } = setup();
  const first = await renderer.prepare(project, output);
  const count = measureText.mock.calls.length;
  expect(await renderer.prepare(project, { ...output })).toBe(first);
  expect(load).toHaveBeenCalledOnce();
  expect(measureText).toHaveBeenCalledTimes(count);
  expect(await renderer.prepare({ ...project }, output)).not.toBe(first);
  await renderer.prepare(project, { width: 320, height: 180 });
  expect(load).toHaveBeenCalledTimes(3);
});
it('does not let a late older preparation replace the current completed project', async () => {
  const { renderer, load, project } = setup();
  let resolveFirst!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  load.mockImplementationOnce(async () => {
    await gate;
    return [{ status: 'loaded' }];
  });
  const first = renderer.prepare(project, output);
  const secondProject = { ...project };
  const second = await renderer.prepare(secondProject, output);
  resolveFirst();
  await first;
  expect(await renderer.prepare(secondProject, output)).toBe(second);
  expect(load).toHaveBeenCalledTimes(2);
});
it.each(['abort', 'clear'] as const)(
  'rejects late %s and prepares again on retry',
  async (action) => {
    const { renderer, load, project } = setup();
    let resolveLoad!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    load.mockImplementationOnce(async () => {
      await gate;
      return [{ status: 'loaded' }];
    });
    const controller = new AbortController();
    const pending = renderer.prepare(project, output, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    if (action === 'abort') controller.abort();
    else renderer.clear();
    resolveLoad();
    await rejected;
    await renderer.prepare(project, output);
    expect(load).toHaveBeenCalledTimes(2);
  }
);
it('does not cache font refusal and preserves the project for retry', async () => {
  const { renderer, load, project } = setup();
  const before = structuredClone(project);
  load.mockResolvedValueOnce([]);
  await expect(renderer.prepare(project, output)).rejects.toThrow('Caption font is unavailable');
  const prepared = await renderer.prepare(project, output);
  expect(prepared.plan.cues).toHaveLength(1);
  expect(project).toEqual(before);
  expect(load).toHaveBeenCalledTimes(2);
});
