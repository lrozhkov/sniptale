// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuidePrint } from './print';
import { GuideReader } from './reader';

const t = createTranslator('en');
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createGuideProject('Printable guide');
  const step = createGuideStep('Image step', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image',
      assetId: 'asset',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'image.png' },
    })
  );
  project.items = [step, createGuideStep('Last step', 'last')];
  return {
    host,
    root,
    project,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
function button(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.includes(label) || node.title === label
  );
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
it('waits for decoded images, prevents duplicate printing and leaves canonical defaults unchanged', async () => {
  const s = setup();
  const original = structuredClone(s.project);
  let resolve: (() => void) | undefined;
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    ),
  });
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  try {
    await act(async () =>
      s.root.render(
        <GuidePrint project={s.project} images={{ asset: 'blob:image' }} t={t} onClose={vi.fn()} />
      )
    );
    await act(async () => button(s.host, 'Landscape').click());
    expect(s.host.querySelector('style')?.textContent).toContain('A4 landscape');
    await act(async () => button(s.host, 'Letter').click());
    await act(async () => button(s.host, 'Each step on a new page').click());
    expect(s.host.querySelector('style')?.textContent).toContain('letter landscape');
    expect(s.host.querySelector('main')?.dataset['pagination']).toBe('step');
    await act(async () => {
      button(s.host, 'Print / PDF').click();
      button(s.host, 'Print / PDF').click();
    });
    expect(print).not.toHaveBeenCalled();
    expect(button(s.host, 'Print / PDF').disabled).toBe(true);
    await act(async () => resolve?.());
    expect(print).toHaveBeenCalledTimes(1);
    expect(s.project).toEqual(original);
  } finally {
    await s.close();
  }
});
it('blocks missing images and reports decode failure without printing', async () => {
  const s = setup();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockRejectedValue(new Error('decode')),
  });
  try {
    await act(async () =>
      s.root.render(
        <GuidePrint project={s.project} images={{ asset: null }} t={t} onClose={vi.fn()} />
      )
    );
    expect(button(s.host, 'Print / PDF').disabled).toBe(true);
    await act(async () =>
      s.root.render(
        <GuidePrint project={s.project} images={{ asset: 'blob:image' }} t={t} onClose={vi.fn()} />
      )
    );
    await act(async () => button(s.host, 'Print / PDF').click());
    expect(print).not.toHaveBeenCalled();
    expect(s.host.textContent).toContain('Images could not be prepared');
  } finally {
    await s.close();
  }
});
it('cancels pending preparation when leaving and restores reader focus and item', async () => {
  const s = setup();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  let resolve: (() => void) | undefined;
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    ),
  });
  try {
    await act(async () =>
      s.root.render(
        <GuideReader
          project={s.project}
          images={{ asset: 'blob:image' }}
          initialId="last"
          t={t}
          onClose={vi.fn()}
        />
      )
    );
    await act(async () => button(s.host, 'Step by step').click());
    await act(async () => button(s.host, 'Print / PDF').click());
    expect(s.host.querySelectorAll('article')).toHaveLength(2);
    await act(async () => button(s.host, 'Letter').click());
    await act(async () => button(s.host, 'Landscape').click());
    await act(async () => button(s.host, 'Print / PDF').click());
    await act(async () => button(s.host, 'Back to export').click());
    await act(async () => resolve?.());
    expect(print).not.toHaveBeenCalled();
    expect(s.host.querySelector('article')?.id).toBe('last');
    expect(document.activeElement).toBe(button(s.host, 'Print / PDF'));
    await act(async () => button(s.host, 'Print / PDF').click());
    expect(s.host.querySelector('style')?.textContent).toContain('letter landscape');
  } finally {
    await s.close();
  }
});

it('keeps step grouping disposable and retains it when reopening print', async () => {
  const s = setup();
  const original = structuredClone(s.project);
  const onClose = vi.fn();
  try {
    await act(async () =>
      s.root.render(
        <GuidePrint project={s.project} images={{ asset: 'blob:image' }} t={t} onClose={onClose} />
      )
    );
    const toggle = () =>
      s.host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Keep steps together"]')!;
    await act(async () => toggle().click());
    expect(s.host.querySelector('main')?.dataset['keepSteps']).toBe('true');
    await act(async () => button(s.host, 'Each step on a new page').click());
    expect(toggle()).toBeNull();
    await act(async () => button(s.host, 'Back to export').click());
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ keepStepsTogether: true, pagination: 'step' })
    );
    await act(async () => s.root.render(null));
    await act(async () =>
      s.root.render(
        <GuidePrint
          project={s.project}
          initialSettings={{ ...s.project.print, keepStepsTogether: true }}
          images={{ asset: 'blob:image' }}
          t={t}
          onClose={onClose}
        />
      )
    );
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(s.project).toEqual(original);
  } finally {
    await s.close();
  }
});

it('retains caption alignment in the print projection', async () => {
  const s = setup();
  const step = s.project.items[0];
  if (step?.kind !== 'step' || step.blocks[0]?.kind !== 'image')
    throw new Error('Missing image fixture');
  step.blocks[0].caption = 'Caption';
  step.blocks[0].captionAlignment = 'end';
  try {
    await act(async () =>
      s.root.render(
        <GuidePrint project={s.project} images={{ asset: 'blob:image' }} t={t} onClose={vi.fn()} />
      )
    );
    expect(s.host.querySelector('figcaption')?.style.textAlign).toBe('end');
  } finally {
    await s.close();
  }
});
