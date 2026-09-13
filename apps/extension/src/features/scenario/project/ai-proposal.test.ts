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
    scope: 'blocks',
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

it('admits a complete guide reconstruction with sections, titles, image reuse and document appearance', () => {
  const { project } = fixture();
  const scope = { stepIds: ['first', 'second'], blockIds: [], document: true };
  const original = structuredClone(project);
  const image = {
    kind: 'image',
    id: 'moved-image',
    sourceBlockId: 'image',
    caption: 'Preserved image',
    alt: '',
    frame: { width: 200, height: 100 },
    fit: 'contain',
    contentTransform: { x: 0, y: 0, scale: 1 },
    width: 60,
  };
  const operations = [
    {
      type: 'replaceStructure',
      items: [
        {
          kind: 'section',
          id: 'section',
          title: 'Start here',
          paragraphs: [],
          numbering: { restartAt: 1 },
        },
        {
          kind: 'step',
          id: 'first',
          title: 'Renamed main title',
          showNumber: true,
          layout: 'side-by-side',
          styleOverrides: {},
          blocks: [
            {
              kind: 'text',
              id: 'text',
              paragraphs: createGuideParagraphs('Rewritten content'),
              width: 40,
            },
            image,
          ],
        },
        {
          kind: 'step',
          id: 'new-step',
          title: 'Check the result',
          showNumber: true,
          layout: 'stacked',
          styleOverrides: {},
          blocks: [
            {
              kind: 'note',
              id: 'note',
              tone: 'warning',
              paragraphs: createGuideParagraphs('Check offline.'),
            },
            { ...image, id: 'copy-image' },
          ],
        },
      ],
    },
    {
      type: 'setDocumentParameters',
      parameters: { name: 'New guide', style: { ...project.style, contentWidth: 'wide' } },
    },
  ];
  expect(prepareGuideAiProposal(project, scope, operations)).toHaveLength(2);
  const next = applyGuideAiProposal(project, scope, operations);
  expect(next.items.map((item) => item.title)).toEqual([
    'Start here',
    'Renamed main title',
    'Check the result',
  ]);
  expect(next).toMatchObject({
    id: project.id,
    name: 'New guide',
    style: { contentWidth: 'wide' },
  });
  const images = next.items.flatMap((item) =>
    item.kind === 'step' ? item.blocks.filter((block) => block.kind === 'image') : []
  );
  expect(images).toHaveLength(2);
  expect(images[0]).toMatchObject({
    assetId: 'private-asset',
    source: { kind: 'import', filename: 'private-file.png' },
    width: 60,
  });
  expect(images[0]).not.toHaveProperty('sourceBlockId');
  expect(project).toEqual(original);
  expect(selectGuideAiContent(project, scope).snapshot).toMatchObject({
    scope: 'document',
    document: { name: project.name },
    items: [{ id: 'first' }, { id: 'second' }],
  });
  expect(JSON.stringify(selectGuideAiContent(project, scope).snapshot)).not.toContain(
    'private-asset'
  );
});

it('rejects invalid structural scope, conflicts, references and identities atomically', () => {
  const { project, scope } = fixture();
  const original = structuredClone(project);
  const documentScope = { ...scope, stepIds: ['first', 'second'], document: true };
  const step = {
    kind: 'step',
    id: 'first',
    title: 'Title',
    showNumber: true,
    layout: 'stacked',
    styleOverrides: {},
    blocks: [],
  };
  expect(() =>
    applyGuideAiProposal(project, scope, [{ type: 'replaceStructure', items: [] }])
  ).toThrow();
  expect(() => applyGuideAiProposal(project, { ...scope, document: true }, [])).toThrow();
  expect(() =>
    applyGuideAiProposal(project, scope, [
      { type: 'setDocumentParameters', parameters: { name: 'Foreign' } },
    ])
  ).toThrow();
  expect(() =>
    applyGuideAiProposal(project, { ...scope, blockIds: ['text'] }, [
      { type: 'replaceStep', stepId: 'first', step },
    ])
  ).toThrow();
  for (const operations of [
    [{ type: 'replaceStructure', items: [step, step] }],
    [
      { type: 'replaceStructure', items: [] },
      { type: 'setStepTitle', stepId: 'first', title: 'Conflict' },
    ],
    [
      { type: 'replaceStep', stepId: 'first', step },
      { type: 'setText', stepId: 'first', blockId: 'text', text: 'Conflict' },
    ],
    [{ type: 'replaceStep', stepId: 'first', step: { ...step, id: 'second' } }],
    [
      {
        type: 'replaceStep',
        stepId: 'first',
        step: {
          ...step,
          blocks: [
            {
              kind: 'image',
              id: 'image',
              sourceBlockId: 'foreign',
              alt: '',
              caption: '',
              frame: { width: 100, height: 100 },
              fit: 'contain',
              contentTransform: { x: 0, y: 0, scale: 1 },
            },
          ],
        },
      },
    ],
  ])
    expect(() => prepareGuideAiProposal(project, documentScope, operations)).toThrow();
  expect(project).toEqual(original);
});

it('supports rich block replacement and inherited appearance reset while preserving unselected content', () => {
  const { project, scope } = fixture();
  const replacement = {
    type: 'replaceBlock',
    stepId: 'first',
    blockId: 'text',
    block: {
      kind: 'note',
      id: 'text',
      tone: 'warning',
      paragraphs: [{ runs: [{ text: 'Read this', bold: true, italic: true, href: null }] }],
    },
  };
  const next = applyGuideAiProposal(project, { ...scope, blockIds: ['text'] }, [replacement]);
  expect(next.items[0]).toMatchObject({ title: 'Selected title', blocks: [replacement.block, {}] });
  expect(next.items[0]?.kind === 'step' && next.items[0].blocks[0]).not.toHaveProperty('width');
  expect(next.items[1]).toEqual(project.items[1]);
  expect(() =>
    prepareGuideAiProposal(project, { ...scope, blockIds: ['image'] }, [replacement])
  ).toThrow();
  expect(() =>
    prepareGuideAiProposal(project, scope, [
      replacement,
      { type: 'setText', stepId: 'first', blockId: 'text', text: 'Conflict' },
    ])
  ).toThrow();
});

it('can create the first step in an explicitly selected empty document', () => {
  const project = createGuideProject('Empty');
  const step = {
    kind: 'step',
    id: 'new',
    title: 'Start',
    showNumber: true,
    layout: 'stacked',
    styleOverrides: {},
    blocks: [],
  };
  expect(
    applyGuideAiProposal(project, { stepIds: [], blockIds: [], document: true }, [
      { type: 'replaceStructure', items: [step] },
    ]).items
  ).toHaveLength(1);
  expect(() => applyGuideAiProposal(project, { stepIds: [], blockIds: [] }, [])).toThrow();
});

it('projects and applies minimum prose height through the generated AI parameter surface', () => {
  const { project, scope } = fixture();
  const operation = {
    type: 'setBlockParameters',
    stepId: 'first',
    blockId: 'text',
    parameters: { minHeight: 240 },
  };
  const next = applyGuideAiProposal(project, scope, [operation]);
  expect(selectGuideAiContent(next, scope).snapshot.steps[0]?.blocks[0]).toMatchObject({
    parameters: { minHeight: 240 },
  });
  expect(next.items[0]).toMatchObject({ blocks: [{ id: 'text', minHeight: 240 }, {}] });
  expect(project.items[0]).not.toMatchObject({ blocks: [{ minHeight: 240 }, {}] });
  expect(() =>
    applyGuideAiProposal(project, scope, [{ ...operation, blockId: 'image' }])
  ).toThrow();
});

it('excludes the independent tour from reference-guide AI even for document scope', async () => {
  const { createGuideProject, createTourDocument } = await import('./factories');
  const project = createGuideProject('Guide');
  project.tour = createTourDocument('private-tour');
  project.tour.endScreen.description = 'private tour evidence';
  const content = selectGuideAiContent(project, { stepIds: [], blockIds: [], document: true });
  expect(JSON.stringify(content.snapshot)).not.toContain('private tour evidence');
  expect(JSON.stringify(content.snapshot)).not.toContain('private-tour');
});
