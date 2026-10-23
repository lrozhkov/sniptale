import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { readScenarioViewingSnapshot } from './projects/viewing';
import { assertScenarioSpeechScope } from './speech-scope';
vi.mock('./projects/viewing', () => ({ readScenarioViewingSnapshot: vi.fn() }));
const text = '  Exact 👋\n';
async function scope() {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return {
    workspaceId: 'p',
    workspaceRevision: 7,
    target: { kind: 'scenario-text' as const, slideId: 's', objectId: 'a' },
    sourceTextHash: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
      ''
    ),
  };
}
function snapshot() {
  const project = createGuideProject('Guide', 'p');
  const slide = createTourImageSlide('s');
  slide.actions = [
    { type: 'annotation', object: { id: 'a', text, anchor: null, appearance: null } },
  ];
  project.tour = { ...createTourDocument(), slides: [slide] };
  return { project, revision: 7 };
}
beforeEach(() => vi.resetAllMocks());
it('checks exact saved UTF-8 text and revision without a write-capable read', async () => {
  vi.mocked(readScenarioViewingSnapshot).mockResolvedValue(snapshot());
  expect(await assertScenarioSpeechScope(await scope())).toBe(text);
  expect(readScenarioViewingSnapshot).toHaveBeenCalledWith('p');
  await expect(
    assertScenarioSpeechScope({ ...(await scope()), sourceTextHash: '0'.repeat(64) })
  ).rejects.toThrow('source');
});
it('rejects recreated Scenario identity with a different saved source', async () => {
  const source = snapshot();
  vi.mocked(readScenarioViewingSnapshot).mockResolvedValue(source);
  const captured = await scope();
  source.revision++;
  await expect(assertScenarioSpeechScope(captured)).rejects.toThrow('scope');
  source.revision--;
  const slide = source.project.tour!.slides[0]!;
  if (slide.kind !== 'image') throw Error('fixture');
  slide.actions[0]!.object.text = 'replacement';
  await expect(assertScenarioSpeechScope(captured)).rejects.toThrow('source');
  vi.mocked(readScenarioViewingSnapshot).mockResolvedValue(null);
  await expect(assertScenarioSpeechScope(captured)).rejects.toThrow('scope');
});
it('rejects missing actions and templates while accepting an exactly matching restored source', async () => {
  const captured = await scope();
  const source = snapshot();
  vi.mocked(readScenarioViewingSnapshot).mockResolvedValue(source);
  await expect(
    assertScenarioSpeechScope({ ...captured, target: { ...captured.target, objectId: 'missing' } })
  ).rejects.toThrow('target');
  source.project.purpose = 'step-template';
  await expect(assertScenarioSpeechScope(captured)).rejects.toThrow('target');
  vi.mocked(readScenarioViewingSnapshot).mockResolvedValue(snapshot());
  expect(await assertScenarioSpeechScope(captured)).toBe(text);
});
