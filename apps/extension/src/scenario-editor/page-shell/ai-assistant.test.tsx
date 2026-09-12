// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ configuration: vi.fn(), request: vi.fn(), verify: vi.fn() }));
vi.mock('./runtime/ai-request', () => ({
  loadGuideAiConfiguration: io.configuration,
  requestGuideAiProposal: io.request,
  verifyGuideAiBasis: io.verify,
  GuideAiStaleError: class extends Error {},
}));
vi.mock('../../features/prompt-templates/hooks/use-prompt-templates', () => ({
  usePromptTemplates: () => ({ templates: [], isLoading: false, isMutating: false, error: null }),
}));
import { GuideAiAssistant, GuideAiEntry } from './ai-assistant';
import { GuideAiStaleError } from './runtime/ai-request';
const project = createGuideProject('Guide');
const step = createGuideStep('Before title', 'step');
step.blocks = [{ kind: 'text', id: 'text', paragraphs: createGuideParagraphs('Before text') }];
project.items = [step];
const proposal = {
  baseRevision: 1,
  changes: [
    {
      operation: { type: 'setStepTitle', stepId: 'step', title: 'After title' },
      before: 'Before title',
      after: 'After title',
    },
    {
      operation: { type: 'setText', stepId: 'step', blockId: 'text', text: 'After text' },
      before: 'Before text',
      after: 'After text',
    },
  ],
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const change = vi.fn();
function button(text: string) {
  const match = [...document.querySelectorAll('button')].find(
    (node) => node.textContent === text || node.title === text
  );
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}
async function open(guide = project, selectedBlockId: string | null = null) {
  await act(async () =>
    root.render(
      <GuideAiAssistant
        project={guide}
        selectedStepId="step"
        selectedBlockId={selectedBlockId}
        disabled={false}
        onOpen={() => {}}
        onChange={change}
        onReload={async () => {}}
        t={createTranslator('en')}
      />
    )
  );
  button('AI assistance').focus();
  await act(async () => button('AI assistance').click());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  io.configuration.mockResolvedValue({ providers: [], models: [], defaultModelId: 'model' });
  io.request.mockResolvedValue(proposal);
  io.verify.mockResolvedValue(1);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('requests only explicitly, previews and applies a selected subset once, then restores focus', async () => {
  await open();
  expect(io.request).not.toHaveBeenCalled();
  expect(document.activeElement?.tagName).toBe('TEXTAREA');
  await act(async () => button('Get suggestions').click());
  expect(change).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('After title');
  await act(async () =>
    document.querySelector<HTMLInputElement>('[aria-label="Accept change 1"]')!.click()
  );
  await act(async () => {
    button('Apply selected').click();
    button('Apply selected').click();
  });
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0]![0].items[0]).toMatchObject({
    title: 'Before title',
    blocks: [{ paragraphs: createGuideParagraphs('After text') }],
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button('AI assistance'));
});
it('stops waiting and ignores late results without losing the request', async () => {
  let resolve: ((value: typeof proposal) => void) | undefined;
  io.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  await open();
  await act(async () => {
    button('Get suggestions').click();
    button('Get suggestions').click();
  });
  expect(io.request).toHaveBeenCalledTimes(1);
  await act(async () => button('Stop waiting').click());
  expect(io.request.mock.calls[0]![0].signal.aborted).toBe(true);
  await act(async () => resolve?.(proposal));
  expect(document.querySelector('textarea')).not.toBeNull();
  expect(document.body.textContent).not.toContain('After title');
  expect(change).not.toHaveBeenCalled();
});
it('preserves proposals when the committed basis is stale and never applies them', async () => {
  await open();
  await act(async () => button('Get suggestions').click());
  io.verify.mockRejectedValue(new GuideAiStaleError());
  await act(async () => button('Apply selected').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('changed');
  expect(change).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('After title');
});
it('retries configuration failure and reports request failure without discarding input', async () => {
  io.configuration.mockRejectedValueOnce(new Error('configuration'));
  await open();
  await act(async () => button('Retry').click());
  expect(io.configuration).toHaveBeenCalledTimes(2);
  io.request.mockRejectedValue(new Error('provider'));
  const instruction = document.querySelector('textarea')!.value;
  await act(async () => button('Get suggestions').click());
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector('textarea')!.value).toBe(instruction);
});
it('selects steps explicitly, keeps an empty selection unsendable, and edits the request after preview', async () => {
  await open();
  await act(async () => button('Choose steps').click());
  const checkbox = document.querySelector<HTMLInputElement>(
    '.guide-ai-step-selection input[type="checkbox"]'
  )!;
  await act(async () => checkbox.click());
  expect(button('Get suggestions').disabled).toBe(true);
  await act(async () => checkbox.click());
  await act(async () => {
    const field = document.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      'Shorten this step'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const instruction = document.querySelector('textarea')!.value;
  await act(async () => button('Get suggestions').click());
  expect(io.request.mock.calls[0]![0]).toMatchObject({
    scope: { stepIds: ['step'], blockIds: [] },
    instruction,
  });
  await act(async () => button('Edit request').click());
  expect(document.querySelector('textarea')!.value).toBe(instruction);
  io.request.mockResolvedValue({ baseRevision: 1, changes: [] });
  await act(async () => button('Get suggestions').click());
  expect(document.body.textContent).toContain('No changes proposed');
  expect(button('Apply selected').disabled).toBe(true);
});
it('traps keyboard focus and restores the trigger on Escape', async () => {
  await open();
  const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    length: 1,
    item: () => null,
    [Symbol.iterator]: () => [new DOMRect()][Symbol.iterator](),
  });
  try {
    const first = document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    first.focus();
    await act(async () =>
      first.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(document.activeElement).toBe(button('Get suggestions'));
    await act(async () =>
      button('Get suggestions').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      )
    );
    expect(document.activeElement).toBe(first);
    await act(async () =>
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button('AI assistance'));
  } finally {
    rects.mockRestore();
  }
});
it('aborts an outstanding request when the dialog closes and ignores its late completion', async () => {
  let done: ((value: typeof proposal) => void) | undefined;
  io.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      })
  );
  await open();
  await act(async () => button('Get suggestions').click());
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="dialog"] button')!.click()
  );
  expect(io.request.mock.calls[0]![0].signal.aborted).toBe(true);
  await act(async () => done?.(proposal));
  expect(change).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('enables committed entry states and sends visible image frames only after explicit opt-in', async () => {
  const image = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 100,
    source: { kind: 'import', filename: 'image.png' },
  });
  const withImage = { ...project, items: [{ ...step, blocks: [...step.blocks, image] }] };
  const render = async (status: string) =>
    act(async () =>
      root.render(
        <GuideAiEntry
          project={withImage}
          status={status}
          selectedStepId="step"
          selectedBlockId="image"
          disabled={false}
          onOpen={() => {}}
          onChange={change}
          onReload={async () => {}}
          t={createTranslator('en')}
        />
      )
    );
  await render('dirty');
  expect(button('AI assistance').disabled).toBe(true);
  await render('ready');
  expect(button('AI assistance').disabled).toBe(false);
  await act(async () => button('AI assistance').click());
  const checkbox = document.querySelector<HTMLButtonElement>('.guide-ai-images [role="switch"]')!;
  expect(checkbox.getAttribute('aria-checked')).toBe('false');
  await act(async () => checkbox.click());
  expect(document.querySelector('.guide-ai-disclosure')?.textContent).toContain(
    'visible image frames'
  );
  await act(async () => button('Get suggestions').click());
  expect(io.request.mock.calls[0]![0]).toMatchObject({
    includeImages: true,
    scope: { stepIds: ['step'], blockIds: ['image'] },
  });
});

it('previews presentation changes with inspector labels and explains layout width reset', async () => {
  io.request.mockResolvedValue({
    baseRevision: 1,
    changes: [
      {
        operation: {
          type: 'setStepParameters',
          stepId: 'step',
          parameters: {
            layout: 'comparison',
            showNumber: false,
            styleOverrides: { font: 'serif', accentColor: null },
          },
        },
        before: JSON.stringify({ layout: 'stacked', showNumber: true, styleOverrides: {} }),
        after: JSON.stringify({
          layout: 'comparison',
          showNumber: false,
          styleOverrides: { font: 'serif', accentColor: null },
        }),
      },
    ],
  });
  await open();
  await act(async () => button('Get suggestions').click());
  expect(document.body.textContent).toContain('Step layout: Comparison');
  expect(document.body.textContent).toContain('Show step number: Disabled');
  expect(document.body.textContent).toContain('Font: Serif');
  expect(document.body.textContent).toContain('Layouts change block widths');
  expect(document.body.textContent).not.toContain('styleOverrides');
});

it('sends all steps in document order from a block selection and restores a custom subset', async () => {
  const second = createGuideStep('Second title', 'second');
  const guide = { ...project, items: [step, second] };
  io.request.mockResolvedValue({ baseRevision: 1, changes: [] });
  await open(guide, 'text');
  await act(async () => button('Choose steps').click());
  await act(async () => button('Clear selection').click());
  await act(async () =>
    document.querySelector<HTMLInputElement>('[aria-label="Second title"]')!.click()
  );
  await act(async () => button('Entire guide').click());
  expect(document.body.textContent).toContain('Selected 2 of 2');
  await act(async () => button('Choose steps').click());
  expect(document.querySelector<HTMLInputElement>('[aria-label="Before title"]')!.checked).toBe(
    false
  );
  expect(document.querySelector<HTMLInputElement>('[aria-label="Second title"]')!.checked).toBe(
    true
  );
  await act(async () => button('Entire guide').click());
  await act(async () => button('Get suggestions').click());
  expect(io.request.mock.calls[0]![0]).toMatchObject({
    scope: { stepIds: ['step', 'second'], blockIds: [] },
    includeImages: false,
  });
});
it('searches the selection without changing it and adds only matching steps', async () => {
  const second = createGuideStep('Second title', 'second');
  second.blocks = [{ kind: 'heading', id: 'heading', text: 'Unique content' }];
  io.request.mockResolvedValue({ baseRevision: 1, changes: [] });
  await open({ ...project, items: [step, second] });
  await act(async () => button('Choose steps').click());
  await act(async () => {
    const field = document.querySelector<HTMLInputElement>(
      '[aria-label="Find a step or section"]'
    )!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      field,
      'Unique'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(document.querySelector('[aria-label="Before title"]')).toBeNull();
  expect(document.body.textContent).toContain('Selected 1 of 2');
  await act(async () => button('Select visible').click());
  expect(document.body.textContent).toContain('Selected 2 of 2');
  await act(async () => button('Get suggestions').click());
  expect(io.request.mock.calls[0]![0].scope).toEqual({ stepIds: ['step', 'second'], blockIds: [] });
});

it('keeps selected-only filtering reversible and freezes the picker during a request', async () => {
  let finish!: (value: { baseRevision: number; changes: [] }) => void;
  io.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await open({ ...project, items: [step, createGuideStep('Second title', 'second')] });
  await act(async () => button('Choose steps').click());
  await act(async () => button('Hide unselected items').click());
  expect(document.querySelector('[aria-label="Second title"]')).toBeNull();
  await act(async () => button('Clear selection').click());
  expect(document.body.textContent).toContain('No matching steps');
  expect(button('Get suggestions').disabled).toBe(true);
  await act(async () => button('Show all items').click());
  await act(async () => button('Select visible').click());
  await act(async () => button('Get suggestions').click());
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="Find a step or section"]')!.disabled
  ).toBe(true);
  expect(
    [...document.querySelectorAll<HTMLInputElement>('.guide-ai-selection-row input')].every(
      (input) => input.disabled
    )
  ).toBe(true);
  expect(button('Entire guide').disabled).toBe(true);
  expect(button('Clear selection').disabled).toBe(true);
  await act(async () => button('Stop waiting').click());
  await act(async () => finish({ baseRevision: 1, changes: [] }));
  expect(document.body.textContent).not.toContain('Choose changes to apply');
});
