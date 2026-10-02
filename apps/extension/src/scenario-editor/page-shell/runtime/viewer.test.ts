import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../../features/scenario/project/factories';
import { createTranslator } from '../../../platform/i18n';
const io = vi.hoisted(() => ({
  snapshot: vi.fn(),
  asset: vi.fn(),
  guide: vi.fn(),
  tour: vi.fn(),
  stored: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/projects/viewing', () => ({
  readScenarioViewingSnapshot: io.snapshot,
  readScenarioViewingAsset: io.asset,
}));
vi.mock('./html-export', () => ({ prepareGuideHtml: io.guide }));
vi.mock('./tour-html', () => ({ prepareTourHtml: io.tour }));
vi.mock('../../../composition/persistence/scenario/export-artifacts', () => ({
  readScenarioHtmlArtifact: io.stored,
}));
vi.mock('../html-document', () => ({ getGuideHtmlRuntimeHash: async () => 'fixed-guide-hash' }));
vi.mock('../../../features/scenario/tour-player/document', () => ({
  getTourPlayerRuntimeHash: async () => 'fixed-tour-hash',
}));
import { prepareScenarioView, readScenarioViewRoute } from './viewer';
beforeEach(() => vi.resetAllMocks());
it('routes only explicit valid view requests and rejects duplicate or malformed modes', () => {
  expect(readScenarioViewRoute('?projectId=p')).toBeNull();
  expect(readScenarioViewRoute('?view=tour&projectId=p')).toEqual({ mode: 'tour', projectId: 'p' });
  for (const search of [
    '?view=edit&projectId=p',
    '?view=guide',
    '?view=guide&projectId=p&view=tour',
    '?view=guide&projectId=p&projectId=x',
  ])
    expect(readScenarioViewRoute(search)).toEqual({ mode: 'invalid' });
});
it('binds guide preparation to a committed revision and uses a read-only asset loader', async () => {
  const project = createGuideProject('Saved');
  project.items = [createGuideStep('Step')];
  io.snapshot.mockResolvedValue({ project, revision: 4 });
  const blob = new Blob(['html']);
  io.guide.mockImplementation(async (args) => {
    await args.readAsset('image');
    return blob;
  });
  const args = {
    projectId: project.id,
    mode: 'guide' as const,
    t: createTranslator('en'),
    theme: 'light' as const,
    signal: new AbortController().signal,
  };
  expect(await prepareScenarioView(args)).toEqual({
    status: 'ready',
    blob,
    name: 'Saved',
    revision: 4,
    mode: 'guide',
  });
  expect(io.asset).toHaveBeenCalledWith(project.id, 'image');
  expect(io.tour).not.toHaveBeenCalled();
  io.snapshot.mockResolvedValue(null);
  expect(await prepareScenarioView(args)).toEqual({ status: 'unavailable' });
  io.snapshot.mockResolvedValue({ project: { ...project, items: [] }, revision: 5 });
  expect(await prepareScenarioView(args)).toEqual({ status: 'empty', name: 'Saved' });
  expect(await prepareScenarioView({ ...args, mode: 'tour' })).toEqual({
    status: 'empty',
    name: 'Saved',
  });
});
it('does not publish preparation completed after cancellation', async () => {
  const project = createGuideProject('Saved');
  project.items = [createGuideStep('Step')];
  io.snapshot.mockResolvedValue({ project, revision: 1 });
  const controller = new AbortController();
  io.guide.mockImplementation(async () => {
    controller.abort();
    return new Blob(['html']);
  });
  await expect(
    prepareScenarioView({
      projectId: project.id,
      mode: 'guide',
      t: createTranslator('en'),
      theme: 'dark',
      signal: controller.signal,
    })
  ).rejects.toThrow();
});

it('routes selected saved files without permitting conflicting identities', () => {
  expect(readScenarioViewRoute('?view=export&exportId=saved')).toEqual({
    mode: 'export',
    exportId: 'saved',
  });
  for (const search of [
    '?view=export',
    '?view=export&exportId=a&exportId=b',
    '?view=export&exportId=a&projectId=p',
    '?view=guide&projectId=p&exportId=a',
  ]) {
    expect(readScenarioViewRoute(search)).toEqual({ mode: 'invalid' });
  }
});
it.each(['guide', 'tour'] as const)(
  'reads exact saved %s bytes and never prepares the current project',
  async (mode) => {
    const blob = new Blob(['saved resources'], { type: 'text/html' });
    io.stored.mockResolvedValue({
      entry: { filename: 'renamed.html', createdAt: 3, html: { mode, assetId: 'body' } },
      blob,
    });
    const args = {
      mode: 'export' as const,
      exportId: 'saved',
      t: createTranslator('en'),
      theme: 'light' as const,
      signal: new AbortController().signal,
    };
    expect(await prepareScenarioView(args)).toEqual({
      status: 'ready',
      mode,
      blob,
      name: 'renamed.html',
      revision: 3,
      scriptHash: `fixed-${mode}-hash`,
    });
    expect(io.stored).toHaveBeenCalledWith('saved');
    expect(io.snapshot).not.toHaveBeenCalled();
    expect(io.guide).not.toHaveBeenCalled();
    expect(io.tour).not.toHaveBeenCalled();
    io.stored.mockResolvedValue(null);
    expect(await prepareScenarioView(args)).toEqual({ status: 'missing-file' });
  }
);
