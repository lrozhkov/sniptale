// @vitest-environment jsdom
import {
  loadCompositionCatalogFixture,
  prepareCompositionTranslations,
} from '../catalog-fixture.test-support';
vi.mock('../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadCompositionCatalogFixture>[0]) =>
    loadCompositionCatalogFixture(locale),
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGlTransitionSelection,
  GL_TRANSITION_PRESET_MAX_BYTES,
  parseGlTransitionPresetJson,
} from '../../features/video/project/transition/gl-catalog';
import { GlTransitionPresetActions } from './actions';
import { translate } from '../../platform/i18n';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, snapshot: object;
let downloaded: Blob | null;
const initial = createGlTransitionSelection('CrossZoom')!;
function file(selection = initial, name = 'Custom') {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ format: 'sniptale-gl-preset', version: 1, name, transition: selection })
  );
  const result = new File([bytes], 'custom.sniptale-gl-preset.json', { type: 'application/json' });
  Object.defineProperty(result, 'arrayBuffer', {
    configurable: true,
    value: vi.fn(async () => bytes.slice().buffer),
  });
  return result;
}
function render(
  options: {
    ownerKey?: string;
    ownerRevision?: object;
    disabled?: boolean;
    onApply?: () => void | boolean | Promise<boolean>;
  } = {}
) {
  const apply = options.onApply ?? vi.fn();
  act(() =>
    root.render(
      <GlTransitionPresetActions
        ownerKey={options.ownerKey ?? 'target'}
        ownerRevision={options.ownerRevision ?? snapshot}
        selection={initial}
        disabled={options.disabled}
        onApply={apply}
      />
    )
  );
  return apply;
}
async function choose(value: File) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [value], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  snapshot = {};
  downloaded = null;
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn((value: Blob | MediaSource) => {
        if (!(value instanceof Blob)) throw Error('Expected blob');
        downloaded = value;
        return 'blob:preset';
      });
      static override revokeObjectURL = vi.fn();
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('imports exact checked parameters once through the supplied command without mutating source', async () => {
  const apply = vi.fn(() => true),
    before = structuredClone(initial);
  render({ onApply: apply });
  const selection = { ...initial, values: { strength: 0.7 } };
  await choose(file(selection));
  expect(apply).toHaveBeenCalledExactlyOnceWith(selection);
  expect(initial).toEqual(before);
  expect(host.querySelector<HTMLInputElement>('input[type=file]')!.value).toBe('');
});
it.each(['hash', 'version'])(
  'shows an unsupported %s identity without calling the command',
  async (kind) => {
    const apply = vi.fn();
    render({ onApply: apply });
    const selection =
      kind === 'hash' ? { ...initial, wgslSha256: '0'.repeat(64) } : { ...initial, version: '99' };
    const source = JSON.stringify({
      format: 'sniptale-gl-preset',
      version: 1,
      name: 'Unavailable',
      transition: selection,
    });
    const value = new File([source], 'unsupported.json');
    Object.defineProperty(value, 'arrayBuffer', {
      value: async () => new TextEncoder().encode(source).buffer,
    });
    await choose(value);
    expect(apply).not.toHaveBeenCalled();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Unavailable');
    expect(host.querySelector('[role=alert]')?.textContent).toContain(initial.name);
  }
);
it('bounds file bytes before reading and leaves retry available', async () => {
  const apply = vi.fn();
  render({ onApply: apply });
  const value = file();
  Object.defineProperty(value, 'size', { value: GL_TRANSITION_PRESET_MAX_BYTES + 1 });
  await choose(value);
  expect(value.arrayBuffer).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(host.querySelector('[role=alert]')?.textContent).toBe(
    translate('videoEditor.effectsLibrary.presetInvalid')
  );
  await choose(file());
  expect(apply).toHaveBeenCalledOnce();
});
it.each(['snapshot', 'target', 'unmount'])(
  'drops pending file completion after %s replacement',
  async (reason) => {
    const apply = vi.fn();
    render({ onApply: apply });
    const value = file();
    const deferred = Promise.withResolvers<ArrayBuffer>();
    Object.defineProperty(value, 'arrayBuffer', { value: () => deferred.promise });
    await choose(value);
    if (reason === 'unmount') act(() => root.render(null));
    else
      render({
        onApply: apply,
        ownerKey: reason === 'target' ? 'other' : 'target',
        ownerRevision: reason === 'snapshot' ? {} : snapshot,
      });
    await act(async () =>
      deferred.resolve(
        new TextEncoder().encode(
          JSON.stringify({
            format: 'sniptale-gl-preset',
            version: 1,
            name: 'Late',
            transition: initial,
          })
        ).buffer
      )
    );
    expect(apply).not.toHaveBeenCalled();
  }
);
it('keeps an explicit refusal retryable and never treats void dispatch as acknowledged success', async () => {
  const apply = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(undefined);
  render({ onApply: apply });
  await choose(file());
  expect(host.querySelector('[role=alert]')?.textContent).toBe(
    translate('videoEditor.effectsLibrary.presetApplyFailed')
  );
  await choose(file());
  expect(apply).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.querySelector('[role=status]')).toBeNull();
});
it('downloads a named preset whose actual bytes reimport exactly and releases the URL', async () => {
  render();
  vi.useFakeTimers();
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
    node.textContent?.includes(translate('videoEditor.effectsLibrary.downloadGlPreset'))
  )!;
  act(() => button.click());
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  if (!downloaded) throw Error('No downloaded preset');
  const promise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(Error('Invalid reader result'));
    reader.onerror = () => reject(Error('Read failed'));
    reader.readAsText(downloaded!);
  });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preset');
  vi.useRealTimers();
  expect(parseGlTransitionPresetJson(await promise)).toEqual({
    ok: true,
    preset: { format: 'sniptale-gl-preset', version: 1, name: initial.name, transition: initial },
  });
});

beforeEach(async () => {
  await prepareCompositionTranslations('video-editor', 'en');
});
