// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { GuideAiChangeValue } from './ai-parameter-preview';
import { translate } from '../../platform/i18n';
import { prepareGuideAiProposal } from '../../features/scenario/project/ai-proposal';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createGuideImageBlock,
} from '../../features/scenario/project/factories';

it('reviews structural content, rich text, appearance and image identity before approval', () => {
  const project = createGuideProject('Guide');
  const step = createGuideStep('Before', 'step');
  step.blocks = [
    { kind: 'heading', id: 'heading', text: 'Heading' },
    {
      kind: 'text',
      id: 'text',
      paragraphs: [
        {
          runs: [
            {
              text: 'Bold linked text',
              bold: true,
              italic: true,
              href: 'https://example.test/help',
            },
          ],
        },
      ],
    },
    {
      kind: 'note',
      id: 'note',
      tone: 'warning',
      paragraphs: createGuideParagraphs('Check offline'),
    },
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 200,
      height: 100,
      source: { kind: 'import', filename: 'private.png' },
    }),
    {
      kind: 'image-slot',
      id: 'empty',
      frame: { width: 200, height: 100 },
      fit: 'contain',
      alt: 'Placeholder',
      caption: 'Future image',
    },
  ];
  project.items = [
    {
      kind: 'section',
      id: 'section',
      title: 'Section',
      paragraphs: createGuideParagraphs('Introduction'),
    },
    step,
  ];
  const scope = { stepIds: ['step'], blockIds: [], document: true };
  const nextStep = {
    ...step,
    title: 'After',
    blocks: step.blocks.map((block) => {
      if (block.kind !== 'image') return block;
      const {
        assetId: _,
        galleryAssetId: _gallery,
        editDocumentId: _edit,
        source: _source,
        ...presentation
      } = block;
      return { ...presentation, sourceBlockId: block.id };
    }),
  };
  const { templateId: _, ...composition } = nextStep;
  const changes = prepareGuideAiProposal(project, scope, [
    { type: 'replaceStructure', items: [project.items[0], composition] },
  ]);
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() =>
    root.render(
      <GuideAiChangeValue
        change={changes[0]!}
        side="after"
        images={{ asset: 'data:image/png;base64,AA==' }}
        t={translate}
      />
    )
  );
  expect(node.textContent).toContain('After');
  expect(node.textContent).toContain('Section');
  expect(node.textContent).toContain('Introduction');
  expect(node.textContent).toContain('Check offline');
  expect(node.textContent).toContain('https://example.test/help');
  expect(node.textContent).not.toContain('private.png');
  expect(node.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
  expect(node.querySelector('a')).toBeNull();
  const styled = Array.from(node.querySelectorAll('span')).find(
    (span) => span.style.fontWeight === 'bold'
  );
  expect(styled?.style.fontStyle).toBe('italic');
  act(() => root.render(<GuideAiChangeValue change={changes[0]!} side="before" t={translate} />));
  expect(node.textContent).toContain('Before');
  expect(node.querySelector('img')).toBeNull();
  const blockChange = prepareGuideAiProposal(project, scope, [
    {
      type: 'replaceBlock',
      stepId: 'step',
      blockId: 'heading',
      block: { kind: 'heading', id: 'heading', text: 'New heading' },
    },
  ])[0]!;
  act(() => root.render(<GuideAiChangeValue change={blockChange} side="after" t={translate} />));
  expect(node.textContent).toContain('New heading');
  act(() => root.unmount());
});
