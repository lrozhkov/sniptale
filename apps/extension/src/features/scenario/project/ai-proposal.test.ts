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
      {
        id: 'first',
        blocks: [
          {
            id: 'image',
            kind: 'image',
            caption: 'Caption',
            alt: 'Alt',
            parameters: {
              fit: 'contain',
              frame: { width: 200, height: 100 },
              contentTransform: { x: 0, y: 0, scale: 1 },
            },
          },
        ],
      },
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

it('applies selected presentation in order while preserving media and authored content', () => {
  const { project, scope } = fixture();
  const operations = [
    {
      type: 'setStepParameters',
      stepId: 'first',
      parameters: { layout: 'comparison', showNumber: false, numbering: { restartAt: 1 } },
    },
    {
      type: 'setBlockParameters',
      stepId: 'first',
      blockId: 'image',
      parameters: {
        width: 40,
        fit: 'cover',
        frame: { width: 640, height: 360 },
        contentTransform: { x: 0.1, y: 0, scale: 1.5 },
      },
    },
    {
      type: 'setBlockParameters',
      stepId: 'first',
      blockId: 'text',
      parameters: { textStyle: { size: 'large', alignment: 'center' } },
    },
  ];
  expect(prepareGuideAiProposal(project, scope, operations)).toHaveLength(3);
  const result = applyGuideAiProposal(project, scope, operations);
  expect(result.items[0]).toMatchObject({
    layout: 'comparison',
    showNumber: false,
    blocks: [
      {
        paragraphs: createGuideParagraphs('Before'),
        textStyle: { size: 'large', alignment: 'center' },
      },
      {
        assetId: 'private-asset',
        source: { kind: 'import', filename: 'private-file.png' },
        caption: 'Caption',
        width: 40,
        fit: 'cover',
      },
    ],
  });
  expect(project.items[0]).not.toEqual(result.items[0]);
});
it('rejects incompatible, resource-changing and out-of-scope parameters atomically', () => {
  const { project, scope } = fixture();
  const before = JSON.stringify(project);
  for (const parameters of [
    { assetId: 'other' },
    { width: 101 },
    { fit: 'cover' },
    {},
    { textStyle: { size: 'huge', alignment: 'start' } },
  ]) {
    expect(() =>
      applyGuideAiProposal(project, scope, [
        { type: 'setBlockParameters', stepId: 'first', blockId: 'text', parameters },
      ])
    ).toThrow();
    expect(JSON.stringify(project)).toBe(before);
  }
  expect(() =>
    applyGuideAiProposal(project, { stepIds: ['first'], blockIds: ['text'] }, [
      { type: 'setStepParameters', stepId: 'first', parameters: { layout: 'text' } },
    ])
  ).toThrow();
});

it('admits heading, note and empty image presentation using their persisted schemas', () => {
  const { project, scope } = fixture();
  const step = project.items[0];
  if (step?.kind !== 'step') throw new Error('Fixture');
  step.blocks.push(
    { id: 'heading', kind: 'heading', text: 'Heading' },
    { id: 'note', kind: 'note', tone: 'neutral', paragraphs: createGuideParagraphs('Notice') },
    {
      id: 'slot',
      kind: 'image-slot',
      frame: { width: 200, height: 100 },
      fit: 'contain',
      caption: '',
      alt: '',
    }
  );
  const result = applyGuideAiProposal(project, scope, [
    {
      type: 'setBlockParameters',
      stepId: step.id,
      blockId: 'heading',
      parameters: { width: 60, textStyle: { size: 'small', alignment: 'end' } },
    },
    {
      type: 'setBlockParameters',
      stepId: step.id,
      blockId: 'note',
      parameters: { tone: 'warning' },
    },
    {
      type: 'setBlockParameters',
      stepId: step.id,
      blockId: 'slot',
      parameters: { fit: 'cover', width: 'half' },
    },
    {
      type: 'setStepParameters',
      stepId: step.id,
      parameters: { styleOverrides: { font: 'serif' } },
    },
  ]);
  expect(result.items[0]).toMatchObject({
    styleOverrides: { font: 'serif' },
    blocks: expect.arrayContaining([
      expect.objectContaining({ id: 'heading', text: 'Heading', width: 60 }),
      expect.objectContaining({
        id: 'note',
        tone: 'warning',
        paragraphs: createGuideParagraphs('Notice'),
      }),
      expect.objectContaining({ id: 'slot', kind: 'image-slot', fit: 'cover', width: 'half' }),
    ]),
  });
  expect(
    selectGuideAiContent(result, { stepIds: [step.id], blockIds: ['slot'] }).snapshot.steps[0]
      ?.blocks
  ).toEqual([
    {
      id: 'slot',
      kind: 'image-slot',
      parameters: { fit: 'cover', width: 'half', frame: { width: 200, height: 100 } },
    },
  ]);
});
