import { expect, it } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
  createGuideParagraphs,
} from './factories';
import { selectGuideAiContent, prepareGuideAiProposal, applyGuideAiProposal } from './ai-proposal';

function fixture() {
  const project = createGuideProject('Private project');
  const first = createGuideStep('Selected title', 'first');
  first.blocks = [
    {
      kind: 'text',
      id: 'text',
      paragraphs: createGuideParagraphs('Before'),
      width: 'half',
      textStyle: { size: 'large', alignment: 'center' },
    },
    {
      ...createGuideImageBlock({
        id: 'image',
        assetId: 'private-asset',
        width: 200,
        height: 100,
        source: { kind: 'import', filename: 'private-file.png' },
      }),
      caption: 'Caption',
      alt: 'Alt',
    },
  ];
  project.items = [first, createGuideStep('Unselected secret', 'second')];
  return { project, scope: { stepIds: ['first'], blockIds: [] } };
}
it('projects only selected text fields and keeps resource data outside the egress snapshot', () => {
  const { project } = fixture();
  const selected = selectGuideAiContent(project, { stepIds: ['first'], blockIds: ['image'] });
  expect(selected.snapshot).toEqual({
    steps: [
      { id: 'first', blocks: [{ id: 'image', kind: 'image', caption: 'Caption', alt: 'Alt' }] },
    ],
  });
  expect(JSON.stringify(selected.snapshot)).not.toMatch(
    /Private|private|Unselected|Selected title/
  );
  expect(selected.images[0]?.block.assetId).toBe('private-asset');
});
it('previews changes and applies an explicit subset without changing media or presentation', () => {
  const { project, scope } = fixture();
  const operations = [
    { type: 'setStepTitle', stepId: 'first', title: 'New title' },
    { type: 'setText', stepId: 'first', blockId: 'text', text: 'After' },
  ];
  expect(
    prepareGuideAiProposal(project, scope, operations).map(({ before, after }) => [before, after])
  ).toEqual([
    ['Selected title', 'New title'],
    ['Before', 'After'],
  ]);
  const result = applyGuideAiProposal(project, scope, [operations[1]]);
  const first = result.items[0];
  if (first?.kind !== 'step') throw new Error('Missing step');
  expect(first.title).toBe('Selected title');
  expect(first.blocks[0]).toMatchObject({
    width: 'half',
    textStyle: { size: 'large', alignment: 'center' },
    paragraphs: createGuideParagraphs('After'),
  });
  expect(first.blocks[1]).toBe(
    project.items[0]?.kind === 'step' ? project.items[0].blocks[1] : undefined
  );
  expect(result.items[1]).toBe(project.items[1]);
  expect(prepareGuideAiProposal(project, scope, [operations[1]])[0]?.before).toBe('Before');
  expect(applyGuideAiProposal(project, scope, [])).toBe(project);
});
it('rejects malformed, missing, mismatched, duplicate and off-scope targets atomically', () => {
  const { project, scope } = fixture();
  const valid = { type: 'setText', stepId: 'first', blockId: 'text', text: 'Valid' };
  for (const invalid of [
    { ...valid, stepId: 'second' },
    { ...valid, blockId: 'missing' },
    { ...valid, blockId: 'image' },
    { type: 'deleteStep', stepId: 'first' },
    { ...valid, extra: true },
    valid,
  ])
    expect(() => applyGuideAiProposal(project, scope, [valid, invalid])).toThrow();
  expect(() =>
    prepareGuideAiProposal(project, { stepIds: ['first'], blockIds: ['text'] }, [
      { type: 'setStepTitle', stepId: 'first', title: 'No' },
    ])
  ).toThrow();
  expect(() => selectGuideAiContent(project, { stepIds: ['missing'], blockIds: [] })).toThrow();
  expect(() =>
    selectGuideAiContent(project, { stepIds: ['first'], blockIds: ['missing'] })
  ).toThrow();
});
