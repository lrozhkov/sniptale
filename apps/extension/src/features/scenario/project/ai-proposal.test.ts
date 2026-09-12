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

it('projects only selected action context without recording or event identifiers', () => {
  const { project } = fixture();
  const step = project.items[0];
  if (step?.kind !== 'step' || step.blocks[1]?.kind !== 'image') throw new Error('Fixture');
  step.blocks[1].source = {
    kind: 'video-frame',
    recordingId: 'private-recording',
    filename: 'private-video',
    timeSeconds: 1,
    action: {
      id: 'private-event',
      kind: 'CLICK',
      time: 1,
      duration: 0.5,
      label: 'Open',
      point: { x: 0.2, y: 0.3 },
      target: { name: 'Open', tag: 'button', role: '' },
    },
  };
  const content = selectGuideAiContent(project, { stepIds: ['first'], blockIds: ['image'] });
  expect(content.snapshot.steps[0]?.blocks[0]).toMatchObject({
    actionContext: { label: 'Open', target: { tag: 'button' } },
  });
  expect(JSON.stringify(content.snapshot)).not.toContain('private');
  expect(
    JSON.stringify(
      selectGuideAiContent(project, { stepIds: ['first'], blockIds: ['text'] }).snapshot
    )
  ).not.toContain('actionContext');
});
