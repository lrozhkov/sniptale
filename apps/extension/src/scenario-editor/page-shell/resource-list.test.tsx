// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideResources } from './resource-list';
import { GUIDE_IMAGE_DRAG_TYPE } from './image-drop';
vi.mock('../../composition/library-preview/player', () => ({
  LibraryMediaPlayer: ({ src }: { src: string }) => <img src={src} alt="Preview" />,
}));
let root: Root;
let host: HTMLDivElement;
const select = vi.fn();
const project = createGuideProject('Guide', 'guide');
const first = createGuideStep('First', 'first');
const second = createGuideStep('Second', 'second');
first.blocks = [
  createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 800,
    height: 600,
    source: { kind: 'import', filename: 'image.png' },
  }),
];
second.blocks = [{ ...first.blocks[0]!, id: 'reused' }];
project.items = [first, second];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 1;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  images: Record<string, string | null> = { asset: 'blob:asset' },
  disabled = false
) {
  await act(async () =>
    root.render(
      <GuideResources
        project={project}
        images={images}
        disabled={disabled}
        onSelect={select}
        t={createTranslator('en')}
      />
    )
  );
}
async function click(label: string, scope: ParentNode = document.body) {
  const button = [...scope.querySelectorAll('button')].find(
    (node) => (node.getAttribute('aria-label') ?? node.textContent) === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
it('groups asset uses and navigates to each occurrence without duplicating rows', async () => {
  await render();
  expect(host.querySelectorAll('.guide-resource-row')).toHaveLength(1);
  await click('Used in 2 places');
  await click('Second · 2');
  expect(select).toHaveBeenLastCalledWith('second');
  await click('First');
  expect(select).toHaveBeenLastCalledWith('first');
});
it('preserves same-project drag payload and disables navigation when edits are locked', async () => {
  await render();
  const data = { setData: vi.fn(), effectAllowed: '' };
  const event = new Event('dragstart', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', { value: data });
  await act(async () => host.querySelector('.guide-resource-main')!.dispatchEvent(event));
  expect(data.setData).toHaveBeenCalledWith(
    GUIDE_IMAGE_DRAG_TYPE,
    JSON.stringify({ projectId: 'guide', blockId: first.blocks[0]!.id })
  );
  await render({}, true);
  expect(host.querySelector<HTMLButtonElement>('.guide-resource-main')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Preview image"]')?.disabled).toBe(
    true
  );
});
it('opens the full image and restores trigger focus on Escape', async () => {
  await render();
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Preview image"]')!;
  trigger.focus();
  await click('Preview image');
  const dialog = document.querySelector('#guide-resource-preview')!;
  expect(dialog.getAttribute('role')).toBe('dialog');
  expect(dialog.querySelector('img')?.src).toBe('blob:asset');
  await act(async () =>
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(document.querySelector('#guide-resource-preview')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
