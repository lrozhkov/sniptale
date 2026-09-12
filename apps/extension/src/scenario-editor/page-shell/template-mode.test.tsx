// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideDocument } from './guide-document';
import { GuidePageHeader } from './header';
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('shows the template context and keeps block editing without step insertion, removal or splitting', async () => {
  const project = createGuideProject('Reusable', 'template', 1);
  project.purpose = 'step-template';
  const step = createGuideStep('Only step', 'step');
  step.blocks = [
    { kind: 'text', id: 'first', paragraphs: createGuideParagraphs('First') },
    { kind: 'text', id: 'second', paragraphs: createGuideParagraphs('Second') },
  ];
  project.items = [step];
  const t = createTranslator('en');
  await act(async () =>
    root.render(
      <>
        <GuidePageHeader
          project={project}
          status="ready"
          commandsDisabled={false}
          disabled={false}
          onAppearance={vi.fn()}
          onDuplicate={async () => {}}
          onDelete={async () => {}}
          onReload={async () => {}}
          onPreview={vi.fn()}
          previewRef={createRef<HTMLButtonElement>()}
          previewDisabled={false}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onChange={vi.fn()}
          t={t}
        />
        <GuideDocument
          project={project}
          selectedId={step.id}
          focusRequest={{ sequence: 0 }}
          images={{}}
          disabled={false}
          onChange={vi.fn()}
          onOperate={vi.fn()}
          onEditImage={vi.fn()}
          onUploadImage={async () => false}
          framedImageId={null}
          onFrameImage={vi.fn()}
          onSelect={vi.fn()}
          onSelectBlock={vi.fn()}
          t={t}
        />
      </>
    )
  );
  expect(host.textContent).toContain('Editing layout');
  expect(host.querySelectorAll('.guide-insertion-item')).toHaveLength(0);
  expect(host.querySelectorAll('.guide-item-actions')).toHaveLength(0);
  expect(host.querySelectorAll('.guide-block-actions')).toHaveLength(2);
  const trigger = host.querySelector<HTMLButtonElement>('.guide-block-actions button')!;
  await act(async () => trigger.click());
  expect(document.body.textContent).not.toContain('Split step here');
  expect(document.body.textContent).toContain('Duplicate block');
});
