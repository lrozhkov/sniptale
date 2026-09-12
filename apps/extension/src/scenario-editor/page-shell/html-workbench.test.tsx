// @vitest-environment jsdom
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideStep,
  createGuideProject,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({ measure: vi.fn(), save: vi.fn(), preview: vi.fn() }));
vi.mock('./runtime/html-export', () => ({
  measureGuideHtml: io.measure,
  exportGuideHtml: io.save,
}));
vi.mock('./runtime/html-images', () => ({ prepareHtmlImage: io.preview }));
import { GuideHtmlWorkbench } from './html-workbench';
afterEach(() => vi.unstubAllGlobals());
it('rejects duplicate jobs, retains measurement through autosave acknowledgement and invalidates edits', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let project = createGuideProject('Guide');
  let resolve:
    | ((value: { size: number; rasters: []; blocks: Record<string, never> }) => void)
    | undefined;
  io.measure.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const render = () =>
    root.render(
      <GuideHtmlWorkbench
        project={project}
        images={{}}
        onChange={(next) => {
          project = next;
          render();
        }}
        onClose={() => {}}
        t={createTranslator('en')}
      />
    );
  const button = (title: string) =>
    host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
  try {
    await act(async () => render());
    expect(button('Save HTML').disabled).toBe(true);
    await act(async () => {
      button('Calculate size').click();
      button('Calculate size').click();
    });
    expect(io.measure).toHaveBeenCalledTimes(1);
    await act(async () => resolve?.({ size: 1024, rasters: [], blocks: {} }));
    expect(button('Save HTML').disabled).toBe(false);
    await act(async () => {
      project = { ...project, updatedAt: project.updatedAt + 1 };
      render();
    });
    expect(button('Save HTML').disabled).toBe(false);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role=switch][aria-label="Click to view"]')!.click()
    );
    expect(project.htmlExport?.viewer).toBe(false);
    expect(button('Save HTML').disabled).toBe(true);
    await act(async () => button('Calculate size').click());
    await act(async () => resolve?.({ size: 1024, rasters: [], blocks: {} }));
    const normalized = parseGuideProject(project);
    if (normalized.status !== 'ok') throw new Error('Invalid fixture');
    await act(async () => {
      project = normalized.project;
      render();
    });
    expect(button('Save HTML').disabled).toBe(false);
    await act(async () => button('Calculate size').click());
    const args = io.measure.mock.calls.at(-1)?.[0];
    await act(async () => root.unmount());
    expect(args.signal.aborted).toBe(true);
    await act(async () => resolve?.({ size: 2048, rasters: [], blocks: {} }));
  } finally {
    host.remove();
  }
});

it('reports failed jobs, supports retry and distinguishes committed history failure', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  io.measure
    .mockReset()
    .mockRejectedValueOnce(new Error('decode'))
    .mockResolvedValue({ size: 1024, rasters: [], blocks: new Map() });
  io.save
    .mockReset()
    .mockRejectedValueOnce(new Error('disk'))
    .mockResolvedValueOnce('history-failed')
    .mockResolvedValueOnce('saved');
  const button = (title: string) =>
    host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
  try {
    await act(async () =>
      root.render(
        <GuideHtmlWorkbench
          project={createGuideProject('Guide')}
          images={{}}
          onChange={() => {}}
          onClose={() => {}}
          t={createTranslator('en')}
        />
      )
    );
    await act(async () => button('Calculate size').click());
    expect(host.textContent).toContain('Could not save HTML');
    await act(async () => button('Calculate size').click());
    await act(async () => button('Save HTML').click());
    expect(host.textContent).toContain('Could not save HTML');
    await act(async () => button('Save HTML').click());
    expect(host.textContent).toContain('File saved, but export history');
    await act(async () => button('Save HTML').click());
    expect(host.textContent).toContain('HTML saved');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('applies selected overrides, restores defaults and releases encoded previews', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview');
      static revokeObjectURL = revoke;
    }
  );
  io.preview
    .mockReset()
    .mockResolvedValue({ blob: new Blob(['pixels']), width: 400, height: 200, size: 6 });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let project = createGuideProject('Guide');
  const step = createGuideStep('Step');
  const image = createGuideImageBlock({
    id: 'a',
    assetId: 'asset',
    width: 400,
    height: 200,
    source: { kind: 'import', filename: 'a.png' },
  });
  step.blocks = [image, { ...image, id: 'b' }];
  project.items = [step];
  const render = () =>
    root.render(
      <GuideHtmlWorkbench
        project={project}
        images={{ asset: 'data:image/png;base64,AA==' }}
        onChange={(next) => {
          project = next;
          render();
        }}
        onClose={() => {}}
        t={createTranslator('en')}
      />
    );
  const button = (title: string) =>
    host.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
  const viewer = () =>
    host.querySelector<HTMLButtonElement>('[role=switch][aria-label="Click to view"]')!;
  try {
    await act(async () => render());
    expect(host.querySelector('.guide-html-preview img')?.getAttribute('src')).toBe('blob:preview');
    await act(async () => button('Select all images').click());
    await act(async () => viewer().click());
    expect(
      project.items[0]?.kind === 'step' &&
        project.items[0].blocks.every(
          (block) => block.kind === 'image' && block.htmlExport?.viewer === false
        )
    ).toBe(true);
    await act(async () => button('Select image 2').click());
    await act(async () => viewer().click());
    await act(async () => button('Select image 2').click());
    expect(host.textContent).toContain('Settings differ');
    await act(async () => button('Restore guide defaults').click());
    expect(project.items).toEqual([step]);
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.textContent === 'Guide defaults')!
        .click()
    );
    await act(async () => viewer().click());
    expect(project.htmlExport?.viewer).toBe(false);
    await act(async () => button('Reset all overrides').click());
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>('.guide-html-thumbnail')[1]!.click()
    );
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.textContent === '100%')!
        .click()
    );
    expect(host.querySelector('.guide-html-preview-image')?.getAttribute('data-zoom')).toBe('full');
    expect(io.preview).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('ignores stale image decoding, displays failure and releases the recovered preview on exit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const create = vi.fn(() => 'blob:latest');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    }
  );
  const pending: Array<{
    resolve: (value: { blob: Blob; width: number; height: number; size: number }) => void;
    reject: (error: Error) => void;
  }> = [];
  io.preview.mockImplementation(
    () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  );
  const project = createGuideProject('Guide');
  const step = createGuideStep('Step');
  const image = createGuideImageBlock({
    id: 'a',
    assetId: 'asset',
    width: 400,
    height: 200,
    source: { kind: 'import', filename: 'a.png' },
  });
  step.blocks = [image, { ...image, id: 'b', assetId: 'other-asset' }];
  project.items = [step];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const output = { blob: new Blob(['image']), width: 400, height: 200, size: 5 };
  try {
    await act(async () =>
      root.render(
        <GuideHtmlWorkbench
          project={project}
          images={{}}
          onChange={() => {}}
          onClose={() => {}}
          t={createTranslator('en')}
        />
      )
    );
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>('.guide-html-thumbnail')[1]!.click()
    );
    await act(async () => pending[0]!.resolve(output));
    expect(create).not.toHaveBeenCalled();
    await act(async () => pending[1]!.reject(new Error('decode')));
    expect(host.querySelector('.guide-html-preview')?.textContent).toContain(
      'Could not prepare the image'
    );
    await act(async () =>
      host.querySelectorAll<HTMLButtonElement>('.guide-html-thumbnail')[0]!.click()
    );
    await act(async () => pending[2]!.resolve(output));
    expect(create).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(revoke).toHaveBeenCalledWith('blob:latest');
});
