// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { GuideAiScopePicker } from './ai-scope-picker';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';

it('shows section context, hidden numbering and image descriptions with reversible search', () => {
  const project = createGuideProject('Guide');
  const step = createGuideStep('Upload', 'upload');
  step.showNumber = false;
  step.blocks = [
    {
      ...createGuideImageBlock({
        id: 'image',
        assetId: 'asset',
        width: 100,
        height: 100,
        source: { kind: 'import', filename: 'file.png' },
      }),
      alt: 'Screenshot of upload',
    },
  ];
  project.items = [{ kind: 'section', id: 'section', title: 'Preparation', paragraphs: [] }, step];
  const node = document.createElement('div');
  const root = createRoot(node);
  const chooseSteps = vi.fn();
  const session = {
    mode: 'steps' as const,
    stepIds: [],
    scope: { stepIds: [], blockIds: [] },
    pending: false,
    chooseMode: vi.fn(),
    chooseStep: vi.fn(),
    chooseSteps,
  };
  act(() =>
    root.render(
      <GuideAiScopePicker
        project={project}
        session={session}
        selectedStepId={null}
        selectedBlockId={null}
        t={createTranslator('en')}
      />
    )
  );
  expect(node.textContent).toContain('Preparation');
  expect(node.textContent).toContain('Screenshot of upload');
  expect(node.querySelector('.guide-ai-selection-number svg')).not.toBeNull();
  const input = node.querySelector('input[type="text"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'missing'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(node.textContent).toContain('No matching steps');
  const clear = node.querySelector<HTMLButtonElement>('[title="Clear search"]')!;
  act(() => clear.click());
  expect(node.textContent).toContain('Upload');
  expect(chooseSteps).not.toHaveBeenCalled();
  act(() => root.unmount());
});
