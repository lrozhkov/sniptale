// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { addVideoProjectManualText } from '../../../../../features/video/project/text/authoring';
import { useVideoEditorStore } from '../../../../state/store';
import { InspectProjectTextPanel } from './text';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
  getCurrentLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  useVideoEditorStore.getState().setProject(createEmptyVideoProject('Text'));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.unstubAllGlobals();
});
function Harness() {
  const project = useVideoEditorStore((state) => state.project);
  return project ? <InspectProjectTextPanel key={project.id} project={project} /> : null;
}
function mount() {
  act(() => root.render(<Harness />));
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.textContent?.includes(label) ||
      node.title === label ||
      node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => button.click());
}
function type(value: string) {
  const field = host.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function fragment() {
  return useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments[0]!;
}
function create() {
  mount();
  click('videoEditor.sidebar.newProjectText');
}
it('creates text, groups typing into one Undo action and retains caption appearance across disable', () => {
  create();
  expect(useVideoEditorStore.getState().project!.duration).toBe(3);
  expect(fragment().timeDomain).toBe('result');
  const field = host.querySelector('textarea')!;
  act(() => field.focus());
  type('One');
  type('One two');
  act(() => field.blur());
  expect(fragment().text).toBe('One two');
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(fragment().text).toBe('');
  act(() => useVideoEditorStore.getState().redoProject());
  expect(fragment().text).toBe('One two');
  click('gallery.videoReview.captionsEnabled');
  const top =
    host.querySelector<HTMLButtonElement>('[aria-label="gallery.videoReview.captionTop"]') ??
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === 'gallery.videoReview.captionTop'
    )!;
  act(() => top.click());
  click('gallery.videoReview.captionsEnabled');
  click('gallery.videoReview.captionsEnabled');
  expect(useVideoEditorStore.getState().project!.textDocuments![0]!.captions?.style.position).toBe(
    'top'
  );
});
it('preserves refused text for repair and never closes another tool history lease', () => {
  create();
  act(() => host.querySelector('textarea')!.blur());
  let foreign: ReturnType<
    ReturnType<typeof useVideoEditorStore.getState>['beginProjectHistoryTransaction']
  >;
  act(() => {
    foreign = useVideoEditorStore.getState().beginProjectHistoryTransaction();
  });
  act(() => host.querySelector('textarea')!.focus());
  type('Retry me');
  expect(fragment().text).toBe('');
  expect(host.querySelector('textarea')!.value).toBe('Retry me');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('textEditStale');
  act(() => host.querySelector('textarea')!.blur());
  expect(useVideoEditorStore.getState().isProjectHistoryTransactionCurrent(foreign!)).toBe(true);
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(foreign!));
  act(() => host.querySelector('textarea')!.focus());
  type('Retry me repaired');
  expect(fragment().text).toBe('Retry me repaired');
  act(() => root.render(null));
  expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
});
it.each([false, true])(
  'rejects an old project context, including same-ID recreation (%s)',
  (sameId) => {
    const basis = useVideoEditorStore.getState().project!;
    act(() => root.render(<InspectProjectTextPanel project={basis} />));
    act(() =>
      useVideoEditorStore
        .getState()
        .setProject({ ...createEmptyVideoProject('Other'), ...(sameId ? { id: basis.id } : {}) })
    );
    click('videoEditor.sidebar.newProjectText');
    expect(useVideoEditorStore.getState().project!.textDocuments).toBeUndefined();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('textEditStale');
  }
);
it('deletes only text, supports Undo and leaves an empty document for its appearance settings', () => {
  create();
  type('Remove');
  act(() => host.querySelector('textarea')!.blur());
  click('gallery.videoReview.textFragmentDelete');
  expect(useVideoEditorStore.getState().project!.textDocuments![0]!.document.fragments).toEqual([]);
  expect(useVideoEditorStore.getState().project!.duration).toBe(0);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(fragment().text).toBe('Remove');
});
it('retains a validation failure draft while the admitted document stays unchanged', () => {
  create();
  act(() => host.querySelector('textarea')!.focus());
  const invalid = 'x'.repeat(16_001);
  type(invalid);
  expect(fragment().text).toBe('');
  expect(host.querySelector('textarea')!.value).toBe(invalid);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  type('Valid');
  expect(fragment().text).toBe('Valid');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it('mounts retained source text with its native clock and disables jumping when dormant', () => {
  const project = createEmptyVideoProject('Dormant');
  const added = addVideoProjectManualText(project, {
    documentId: 'source',
    fragmentId: 'word',
    start: 1,
  });
  if (!added.ok) throw new Error('Missing text');
  const asset = createVideoProjectAsset(
    'Retained source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'retained' },
    {
      width: 0,
      height: 0,
      duration: 12,
      hasAudio: true,
      mimeType: 'audio/webm',
      size: 1,
      audioPeaks: null,
    }
  );
  added.project.assets.push(asset);
  added.entry.binding = { kind: 'source', assetId: asset.id, sourceInstanceId: 'instance' };
  added.entry.document.fragments[0]!.timeDomain = 'source';
  useVideoEditorStore.getState().setProject(added.project);
  mount();
  act(() => host.querySelector<HTMLButtonElement>('article > button')!.click());
  expect(host.textContent).toContain('textClockSource');
  expect(host.textContent).toContain('textSourceExcluded');
  expect(
    host.querySelector<HTMLButtonElement>('[title="gallery.videoReview.speechJump"]')!.disabled
  ).toBe(true);
});
