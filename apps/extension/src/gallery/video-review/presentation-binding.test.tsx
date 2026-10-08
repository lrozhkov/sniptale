// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewPresentationBinding } from './presentation-binding';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';

vi.mock('../../workflows/video-review/asset-bytes', () => ({
  resolveReviewAssetBytes: async () => null,
}));

vi.mock('./presentation-library', () => ({
  ReviewPresentationLibrary: (props: { onSelect(id: string): void; onClose(): void }) => (
    <div>
      <button onClick={() => props.onSelect('library-video')}>Choose Library media</button>
      <button onClick={props.onClose}>Close Library</button>
    </div>
  ),
}));
vi.mock('../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => 'en',
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, 'en'),
  };
});
let host: HTMLDivElement;
let root: Root;
let editor: ComponentProps<typeof ReviewPresentationBinding>['editor'];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  editor = {
    settings: createNeutralPresentationSettings(),
    slotModes: { intro: 'image', outro: 'none' },
    picker: null,
    pending: false,
    error: null,
    canRetry: false,
    audioUnsupported: false,
    preview: vi.fn(),
    change: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    mode: vi.fn(async () => true),
    choose: vi.fn(),
    selectComputer: vi.fn(async () => true),
    selectLibrary: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    retryMuted: vi.fn(async () => true),
    cancel: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render() {
  await act(async () => root.render(<ReviewPresentationBinding editor={editor} />));
}
function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === text || node.getAttribute('aria-label') === text
  )!;
}
it('routes computer choice and preserves the exact captured request for file admission', async () => {
  await render();
  act(() => button('From computer').click());
  expect(editor.choose).toHaveBeenCalledExactlyOnceWith('intro', 'image', 'computer');
  const request = { slot: 'intro', kind: 'image', source: 'computer' } as const;
  editor.picker = request;
  const click = vi.spyOn(HTMLInputElement.prototype, 'click');
  await render();
  expect(click).toHaveBeenCalledTimes(1);
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input.accept).toBe('image/*');
  const file = new File(['image'], 'still.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(editor.selectComputer).toHaveBeenCalledExactlyOnceWith(request, file);
  expect(vi.mocked(editor.selectComputer).mock.calls[0]![0]).toBe(request);
  expect(editor.change).not.toHaveBeenCalled();
});
it('routes Library selection, cancellation, and explicit muted retry independently', async () => {
  const request = { slot: 'outro', kind: 'video', source: 'library' } as const;
  editor = { ...editor, picker: request, canRetry: true, audioUnsupported: true };
  await render();
  await act(async () => {
    button('Choose Library media').click();
    button('Close Library').click();
    button('Add without sound').click();
  });
  expect(editor.selectLibrary).toHaveBeenCalledExactlyOnceWith(request, 'library-video');
  expect(vi.mocked(editor.selectLibrary).mock.calls[0]![0]).toBe(request);
  expect(editor.cancel).toHaveBeenCalledOnce();
  expect(editor.retryMuted).toHaveBeenCalledOnce();
  expect(editor.retry).not.toHaveBeenCalled();
});
it('native cancellation does not submit an empty file or a settings mutation', async () => {
  editor.picker = { slot: 'intro', kind: 'video', source: 'computer' };
  await render();
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  act(() => input.dispatchEvent(new Event('cancel', { bubbles: true })));
  expect(editor.cancel).toHaveBeenCalledOnce();
  expect(editor.selectComputer).not.toHaveBeenCalled();
  expect(editor.change).not.toHaveBeenCalled();
});

it('forwards chosen output geometry to the silent media preview', async () => {
  editor.settings.intro = {
    mode: 'image',
    image: {
      assetId: 'project-asset:preview',
      width: 100,
      height: 100,
      duration: 3,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  await act(async () =>
    root.render(
      <ReviewPresentationBinding editor={editor} output={{ width: 1920, height: 1080 }} />
    )
  );
  const canvas = host.querySelector('canvas');
  expect(canvas?.width).toBe(640);
  expect(canvas?.height).toBe(360);
});
