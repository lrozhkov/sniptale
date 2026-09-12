// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createGuideImageBlock, createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideTemplateControls } from './template-controls';
const io = vi.hoisted(() => ({ save: vi.fn(), apply: vi.fn(), reload: vi.fn() }));
vi.mock('./template-catalog', () => ({
  useGuideTemplateCatalog: () => ({
    entries: [{ id: 'template', name: 'Reusable', availability: 'available' }],
    status: 'ready',
    reload: io.reload,
  }),
}));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  io.save.mockResolvedValue(true);
  io.apply.mockResolvedValue(true);
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
async function render(step = createGuideStep('Authored')) {
  await act(async () =>
    root.render(
      <GuideTemplateControls
        key={step.id}
        step={step}
        disabled={false}
        onSave={io.save}
        onApply={io.apply}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => !node.hidden && (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function choose() {
  await click('My layouts');
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === 'Reusable'
  );
  if (!option) throw new Error('Missing template');
  await act(async () => option.click());
}
it('separates preserving authored content from explicit replacement', async () => {
  await render();
  await choose();
  await click('Apply appearance');
  expect(io.apply).toHaveBeenLastCalledWith('template', 'appearance');
  await click('Replace step content');
  expect(io.apply).toHaveBeenLastCalledWith('template', 'replace');
});
it('uses the capture-preserving quick path for a single image', async () => {
  const step = createGuideStep('Captured');
  step.blocks = [
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 800,
      height: 600,
      source: { kind: 'import', filename: 'capture.png' },
    }),
  ];
  await render(step);
  await choose();
  await click('Apply and keep image');
  expect(io.apply).toHaveBeenCalledWith('template', 'capture');
});
it('retains the name after failure, supports retry and restores focus after cancelling', async () => {
  io.save.mockResolvedValueOnce(false);
  await render();
  await click('Save as layout');
  const input = host.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  await click('Save as layout');
  expect(io.save).toHaveBeenCalledWith('Authored');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(input.value).toBe('Authored');
  await click('Save as layout');
  expect(io.reload).toHaveBeenCalled();
  expect(host.querySelector('input')).toBeNull();
  await click('Save as layout');
  await act(async () =>
    host
      .querySelector('input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(host.querySelector('input')).toBeNull();
  expect(document.activeElement?.textContent).toBe('Save as layout');
});
