// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ list: vi.fn(), import: vi.fn(), revoke: vi.fn(), video: vi.fn() }));
vi.mock('../../composition/persistence/media-library', () => ({ listMediaLibrary: io.list }));
vi.mock('../../composition/persistence/gallery-saved-views', () => ({
  listGallerySavedViews: async () => [],
}));
vi.mock('../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: async () => undefined,
}));
vi.mock('./video-frame-resources', () => ({
  GuideVideoFrameResources: (props: unknown) => {
    io.video(props);
    return <p>Video frame preview</p>;
  },
}));
import { GuideImageResources } from './resources';
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: io.revoke,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  io.import.mockResolvedValue(true);
  io.list.mockResolvedValue([]);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  selectedStepId: string | null = 'step',
  target?: NonNullable<ComponentProps<typeof GuideImageResources>['target']>,
  overrides: Partial<ComponentProps<typeof GuideImageResources>> = {}
) {
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        {...(target ? { target } : {})}
        selectedStepId={selectedStepId}
        steps={[{ id: 'step', title: 'Destination step' }]}
        t={createTranslator('en')}
        onImport={io.import}
        {...overrides}
      />
    )
  );
}
async function click(label: string, scope: ParentNode = host) {
  const button = [...scope.querySelectorAll('button')].find(
    (node) => node.textContent === label || node.getAttribute('aria-label') === label
  );
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.click());
}
async function files(...names: string[]) {
  io.list.mockResolvedValue(
    names.map((name) => ({
      id: name,
      filename: name,
      kind: 'image',
      source: { kind: 'screenshot' },
      tags: [],
    }))
  );
  await act(async () => window.dispatchEvent(new Event('focus')));
  for (const name of names) await click(`Select item: ${name}`);
}
it('previews separately and imports in selection order after deselection and reselection', async () => {
  await render();
  await files('first.png', 'second.png', 'third.png');
  expect(host.querySelector('ol')).toBeNull();
  await click('Select item: first.png');
  await click('Select item: first.png');
  await click('Select item: third.png');
  await click('third.png');
  expect(
    [...host.querySelectorAll('.guide-library-card-select')].map((node) => node.textContent)
  ).toEqual(['2', '1', '']);
  expect(
    host
      .querySelector('.guide-import-actions')
      ?.compareDocumentPosition(host.querySelector('.guide-library-browser')!)
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  await click('As blocks in selected step');
  await click('Import selected');
  expect(
    io.import.mock.calls[0]?.[0].sources.map((source: { mediaId: string }) => source.mediaId)
  ).toEqual(['second.png', 'first.png']);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'blocks', stepId: 'step' });
  expect(host.querySelectorAll('.guide-library-card-select[aria-pressed="true"]')).toHaveLength(0);
});
it('keeps selection after a rejected import and cancels pending preparation', async () => {
  await render();
  await files('first.png');
  io.import.mockResolvedValueOnce(false);
  await click('Import selected');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelectorAll('.guide-library-card-select[aria-pressed="true"]')).toHaveLength(1);
  let finish: (value: boolean) => void = () => undefined;
  io.import.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  await click('Import selected');
  const signal: AbortSignal = io.import.mock.calls[1]?.[0].signal;
  expect(host.querySelector<HTMLButtonElement>('.guide-library-card-select')?.disabled).toBe(true);
  await click('Import selected');
  expect(io.import).toHaveBeenCalledTimes(2);
  await click('Cancel preparation');
  expect(signal.aborted).toBe(true);
  await act(async () => finish(false));
  expect(host.querySelectorAll('.guide-library-card-select[aria-pressed="true"]')).toHaveLength(1);
});
it('filters library to images, retries failures and submits a current library identity', async () => {
  await render(null);
  io.list.mockRejectedValueOnce(new Error('read'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  io.list.mockResolvedValue([
    { id: 'image', kind: 'image', filename: 'Library.png', source: { kind: 'screenshot' } },
    {
      id: 'video',
      kind: 'video',
      mimeType: 'video/mp4',
      filename: 'Movie.mp4',
      source: { kind: 'recording' },
    },
  ]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).not.toContain('Movie.mp4');
  await click('Select item: Library.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toEqual([{ kind: 'library', mediaId: 'image' }]);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'steps' });
});

it('imports one selected source into the requested image block without a destination selector', async () => {
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        selectedStepId="other"
        steps={[
          { id: 'other', title: 'Other step' },
          { id: 'target-step', title: 'Actual target' },
        ]}
        target={{ kind: 'replace-image', stepId: 'target-step', blockId: 'target-image' }}
        t={createTranslator('en')}
        onImport={io.import}
      />
    )
  );
  await files('first.png');
  await files('replacement.png');
  expect(host.querySelector('.guide-import-target')?.textContent).toBe(
    'Replace image in step “Actual target”'
  );
  expect(host.querySelector('[aria-label="Add images"]')).toBeNull();
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 1');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toHaveLength(1);
  expect(io.import.mock.calls[0]?.[0].sources[0].mediaId).toBe('replacement.png');
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({
    kind: 'replace-image',
    stepId: 'target-step',
    blockId: 'target-image',
  });
  expect(host.querySelector('[aria-haspopup="listbox"]')).toBeNull();
});

it('keeps multiple library images targeted to the originating empty step', async () => {
  const complete = vi.fn();
  await act(async () =>
    root.render(
      <GuideImageResources
        disabled={false}
        selectedStepId="other"
        target={{ kind: 'blocks', stepId: 'empty-step' }}
        t={createTranslator('en')}
        onImport={io.import}
        onComplete={complete}
      />
    )
  );
  await files('first.png', 'second.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].sources).toHaveLength(2);
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'blocks', stepId: 'empty-step' });
  expect(complete).toHaveBeenCalledOnce();
});

it('imports a tour replacement as one image and keeps tour slide imports ordered', async () => {
  await render(null, { kind: 'tour-image', slideId: 'tour-slide' });
  await files('first.png', 'second.png');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0]).toMatchObject({
    placement: { kind: 'tour-image', slideId: 'tour-slide' },
    sources: [{ kind: 'library', mediaId: 'second.png' }],
  });
  expect(io.import.mock.calls[0]?.[0].sources).toHaveLength(1);
  await render(null, { kind: 'tour-slides', beforeSlideId: 'tour-slide' });
  await files('first.png', 'second.png');
  await click('Import selected');
  expect(io.import.mock.calls[1]?.[0]).toMatchObject({
    placement: { kind: 'tour-slides', beforeSlideId: 'tour-slide' },
    sources: [
      { kind: 'library', mediaId: 'first.png' },
      { kind: 'library', mediaId: 'second.png' },
    ],
  });
});

it('separates destination, ordered selection count and confirmation without changing selection', async () => {
  await render();
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 0');
  await files('first.png', 'second.png');
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 2');
  await click('As blocks in selected step');
  expect(host.querySelector('.guide-import-target')?.textContent).toBe(
    'Add to step “Destination step”'
  );
  expect(
    [...host.querySelectorAll('.guide-library-card-select')].map((node) => node.textContent)
  ).toEqual(['1', '2']);
  await click('Each as a separate step');
  expect(host.querySelector('.guide-import-target')?.textContent).toBe(
    'New steps in selection order'
  );
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 2');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'steps' });
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 0');
});

it('keeps selected-step insertion disabled without a selected step', async () => {
  await render(null);
  const blocks = host.querySelector<HTMLButtonElement>('[title="As blocks in selected step"]')!;
  expect(blocks.disabled).toBe(true);
  await files('first.png');
  await click('As blocks in selected step');
  expect(blocks.getAttribute('aria-pressed')).toBe('false');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0].placement).toEqual({ kind: 'steps' });
});

it.each([
  [{ kind: 'tour-slides' as const }, 'New slides in selection order'],
  [{ kind: 'tour-image' as const, slideId: 'slide' }, 'Replace slide image'],
  [{ kind: 'tour-background' as const, slideId: 'slide' }, 'Replace slide background'],
])('describes the fixed %s destination without Guide placement controls', async (target, label) => {
  await render(null, target);
  expect(host.querySelector('.guide-import-target')?.textContent).toBe(label);
  expect(host.querySelector('[aria-label="Add images"]')).toBeNull();
});

it('restores image import actions and preserves ordered selection and mode after video return', async () => {
  await render();
  await files('first.png', 'second.png');
  await click('As blocks in selected step');
  io.list.mockResolvedValue([
    ...(await io.list()),
    {
      id: 'clip',
      filename: 'Clip.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      source: { kind: 'recording' },
      tags: [],
    },
  ]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await click('All materials');
  for (let cycle = 0; cycle < 2; cycle++) {
    await click('Clip.mp4');
    expect(host.textContent).toContain('Video frame preview');
    expect(host.querySelector<HTMLElement>('.guide-import-actions')?.hidden).toBe(true);
    await click('Back to materials');
    expect(host.textContent).not.toContain('Video frame preview');
    expect(host.querySelector<HTMLElement>('.guide-import-actions')?.hidden).toBe(false);
    expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 2');
  }
  await click('first.png');
  await click('Back to materials');
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0]).toMatchObject({
    sources: [
      { kind: 'library', mediaId: 'first.png' },
      { kind: 'library', mediaId: 'second.png' },
    ],
    placement: { kind: 'blocks', stepId: 'step' },
  });
});

it.each(['steps', 'blocks', 'replacement', 'tour', 'disabled'] as const)(
  'admits frameless insertion only for an unlocked Guide steps destination: %s',
  async (mode) => {
    const add = vi.fn(() => true);
    const target =
      mode === 'replacement'
        ? { kind: 'replace-image' as const, stepId: 'step', blockId: 'image' }
        : mode === 'tour'
          ? { kind: 'tour-slides' as const }
          : undefined;
    await render('step', target, { onAddTextStep: add });
    if (mode === 'blocks') await click('As blocks in selected step');
    io.list.mockResolvedValue([
      {
        id: 'clip',
        filename: 'Clip.mp4',
        kind: 'video',
        mimeType: 'video/mp4',
        source: { kind: 'recording' },
        tags: [],
      },
    ]);
    await act(async () => window.dispatchEvent(new Event('focus')));
    await click('All materials');
    await click('Clip.mp4');
    if (mode === 'disabled') await render('step', target, { onAddTextStep: add, disabled: true });
    const callback = io.video.mock.lastCall?.[0].onAddTextStep;
    if (mode === 'steps' || mode === 'disabled') {
      expect(callback('Title', 'Body')).toBe(mode === 'steps');
      expect(add).toHaveBeenCalledTimes(mode === 'steps' ? 1 : 0);
      if (mode === 'steps') expect(add).toHaveBeenCalledWith('Title', 'Body');
    } else expect(callback).toBeUndefined();
    expect(io.import).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Video frame preview');
  }
);

it('selects one library image for the global tour stage without slide placement controls', async () => {
  await render(null, { kind: 'tour-stage-background' });
  await files('first.png', 'background.png');
  expect(host.querySelector('.guide-import-target')?.textContent).toBe('Stage background');
  expect(host.querySelector('.guide-import-count')?.textContent).toBe('Selected: 1');
  expect(host.querySelector('[aria-label="Add images"]')).toBeNull();
  await click('Import selected');
  expect(io.import.mock.calls[0]?.[0]).toMatchObject({
    placement: { kind: 'tour-stage-background' },
    sources: [{ kind: 'library', mediaId: 'background.png' }],
  });
});
