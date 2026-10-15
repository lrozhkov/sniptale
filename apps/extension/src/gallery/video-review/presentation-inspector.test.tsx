// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ReviewPresentationInspector,
  type ReviewPresentationInspectorProps,
} from './presentation-inspector';
import {
  createNeutralPresentationSettings,
  parseQuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';

const preview = vi.hoisted(() => ({ audio: true }));
vi.mock('./presentation-media-preview', async () => {
  const { useEffect } = await import('react');
  return {
    ReviewPresentationMediaPreview: ({ onAudio }: { onAudio(value: boolean): void }) => {
      useEffect(() => onAudio(preview.audio), [onAudio]);
      return <div data-testid="media-preview" />;
    },
  };
});

const locale = vi.hoisted(() => ({ value: 'en' as 'en' | 'ru' }));
vi.mock('../../platform/i18n', async (original) => {
  const actual = await original<typeof import('../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => locale.value,
    translate: (key: Parameters<typeof actual.translate>[0]) => actual.translate(key, locale.value),
  };
});
let root: Root;
let host: HTMLDivElement;
let props: ReviewPresentationInspectorProps;
beforeEach(() => {
  locale.value = 'en';
  preview.audio = true;
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
  props = {
    output: { width: 1920, height: 1080 },
    settings: createNeutralPresentationSettings(),
    slotModes: { intro: 'none', outro: 'none' },
    onChange: vi.fn(),
    onPreview: vi.fn(),
    onMode: vi.fn(),
    onChoose: vi.fn(),
    onJoinPreview: vi.fn(),
    onReset: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ReviewPresentationInspector {...props} />));
}
function section(name = 'Beginning') {
  return host.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;
}
function button(label: string, parent: ParentNode = host) {
  return [...parent.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label
  )!;
}
function field(label: string, parent: ParentNode = host) {
  return parent.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}
async function type(label: string, value: string) {
  const node = field(label);
  act(() => node.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return node;
}
function accept(node: HTMLInputElement) {
  act(() => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}
async function select(index: number, option: string, parent: ParentNode = host) {
  act(() =>
    parent.querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')[index]!.click()
  );
  const choice = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === option
  )!;
  expect(choice).toBeDefined();
  await act(async () => {
    choice.click();
    await Promise.resolve();
  });
}
function retained(mode: 'image' | 'video' = 'image') {
  props.settings.intro = {
    mode,
    image: {
      assetId: 'image',
      width: 100,
      height: 100,
      duration: 3,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
    video: {
      assetId: 'video',
      source: { duration: 2, width: 100, height: 100, size: 100, mimeType: 'video/webm' },
      trim: { start: 0.123, end: 1.987 },
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
      audio: { muted: false, gain: 1 },
    },
  };
  props.slotModes.intro = mode;
  props.settings.introTransition = { type: 'dissolve', before: 0.2, after: 0.2 };
}

it('selects one media mode before requesting either acquisition source', async () => {
  await render();
  act(() => button('Media', section()).click());
  props.settings = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  expect(props.settings.introControl?.mode).toBe('media');
  await render();
  expect(button('Preview transition to video', section())).toBeUndefined();
  act(() => {
    button('From computer', section()).click();
    button('From Library', section()).click();
  });
  expect(props.onChoose).toHaveBeenNthCalledWith(1, 'intro', 'media', 'computer');
  expect(props.onChoose).toHaveBeenNthCalledWith(2, 'intro', 'media', 'library');
  expect(parseQuickEditPresentationSettings(props.settings)).not.toBeNull();
});
it('commits valid image duration once on Enter plus blur and retains remembered video', async () => {
  retained();
  await render();
  const node = await type('Duration', '4.2');
  expect(props.onChange).not.toHaveBeenCalled();
  accept(node);
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      intro: { ...props.settings.intro, image: { ...props.settings.intro.image, duration: 4.2 } },
    })
  );
});
it('cancels numeric drafts without a later blur commit', async () => {
  retained();
  await render();
  const node = await type('Duration', '9');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => node.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});
it.each([
  ['.01', 0.1],
  ['61', 60],
])('keeps exact image duration in the valid range for %s', async (typed, duration) => {
  retained();
  await render();
  accept(await type('Duration', String(typed)));
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({ image: expect.objectContaining({ duration }) }),
    })
  );
});
it('shows video trim milliseconds without rounding and commits full precision', async () => {
  retained('video');
  await render();
  expect(field('Trim start').value).toBe('0.123');
  expect(field('Trim end').value).toBe('1.987');
  accept(await type('Trim start', '.234'));
  expect(props.onChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        video: expect.objectContaining({ trim: { start: 0.234, end: 1.987 } }),
      }),
    })
  );
});
it('preserves an existing submillisecond trim and rejects collapsed proposals', async () => {
  retained('video');
  props.settings.intro.video!.source.duration = 0.0008;
  props.settings.intro.video!.trim = { start: 0.0001, end: 0.0007 };
  await render();
  expect(field('Trim start').value).toBe('0.0001');
  expect(field('Trim end').value).toBe('0.0007');
  accept(await type('Trim end', '.0001'));
  expect(props.onChange).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Trim end must be after trim start.');
  accept(await type('Trim end', '.0006'));
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        video: expect.objectContaining({ trim: { start: 0.0001, end: 0.0006 } }),
      }),
    })
  );
});
it('preserves both variants when requesting None and changes only cover framing', async () => {
  retained();
  await render();
  act(() => button('No effect', section()).click());
  const disabled = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  expect(disabled.introControl?.mode).toBe('none');
  expect(disabled.intro).toEqual(props.settings.intro);
  await select(0, 'Fill', section());
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        image: expect.objectContaining({ fit: 'cover' }),
        video: props.settings.intro.video,
      }),
    })
  );
  props.settings.intro.image!.fit = 'cover';
  await render();
  accept(await type('Framing X', '25'));
  expect(props.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        image: expect.objectContaining({ crop: { panX: 0.25, panY: 0 } }),
      }),
    })
  );
});
it('controls video sound, gain, and join preview independently', async () => {
  retained('video');
  await render();
  accept(await type('Volume', '150'));
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        video: expect.objectContaining({ audio: { muted: false, gain: 1.5 } }),
      }),
    })
  );
  const sound = section().querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Bookend audio"]'
  )!;
  expect(sound.getAttribute('aria-checked')).toBe('true');
  act(() => sound.click());
  expect(props.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({
        video: expect.objectContaining({ audio: { muted: true, gain: 1 } }),
      }),
    })
  );
  act(() => button('Preview transition to video', section()).click());
  expect(props.onJoinPreview).toHaveBeenCalledWith('intro', 'join');
});
it('exposes pending state and errors while disabling actions', async () => {
  retained();
  props.pending = true;
  props.error = 'Replace the missing image';
  await render();
  const fieldset = host.querySelector('fieldset')!;
  expect(fieldset.disabled).toBe(true);
  expect(fieldset.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(props.error);
  act(() => {
    button('From computer', section()).click();
    button('Reset beginning').click();
  });
  expect(props.onChoose).not.toHaveBeenCalled();
  expect(props.onReset).not.toHaveBeenCalled();
});
it.each([
  ['en', 'Fade in', 'Beginning', 'No effect', 'Reset beginning'],
  ['ru', 'Появление', 'Начало ролика', 'Без эффекта', 'Сбросить начало'],
] as const)(
  'renders real %s messages and reset action',
  async (language, fade, intro, none, reset) => {
    locale.value = language;
    retained();
    await render();
    expect(host.textContent).toContain(fade);
    expect(section(intro)).not.toBeNull();
    expect(button(none, section(intro))).toBeDefined();
    act(() => button(reset).click());
    expect(vi.mocked(props.onChange).mock.calls.at(-1)![0].introControl?.mode).toBe('none');
    expect(host.textContent).not.toContain('gallery.videoReview.');
  }
);

it('uses an independent 1–10 slider and previews before one keyboard commit', async () => {
  retained();
  await render();
  const range = field('Duration range');
  expect(range.min).toBe('1');
  expect(range.max).toBe('10');
  act(() =>
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(props.onPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({
      intro: expect.objectContaining({ image: expect.objectContaining({ duration: 3.1 }) }),
    })
  );
  expect(props.onChange).not.toHaveBeenCalled();
  act(() => range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })));
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});
it('cancels an active range preview before its key-up commit', async () => {
  retained();
  await render();
  const range = field('Duration range');
  act(() =>
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(props.onPreview).toHaveBeenCalled();
  act(() => range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })));
  expect(props.onChange).not.toHaveBeenCalled();
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
});
it('rejects collapsed trim previews and cancels the validation feedback', async () => {
  retained('video');
  props.settings.intro.video!.trim = { start: 0, end: 0.001 };
  await render();
  const range = field('Trim start range');
  act(() => range.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(props.onPreview).toHaveBeenLastCalledWith(null);
  expect(host.textContent).toContain('Trim end must be after trim start.');
  act(() => range.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(props.onChange).not.toHaveBeenCalled();
});
it('keeps fade settings independent and retains them when media is selected', async () => {
  await render();
  act(() => button('Fade in', section()).click());
  props.settings = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  await render();
  const fadeAudio = section().querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Fade audio"]'
  )!;
  expect(fadeAudio.getAttribute('aria-checked')).toBe('false');
  act(() => fadeAudio.click());
  const changed = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  expect(changed.introControl?.plain.audioFade).toBe(true);
  expect(changed.outroControl).toBeUndefined();
  props.settings = changed;
  await render();
  act(() => button('Media', section()).click());
  const next = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  expect(next.introControl?.plain.audioFade).toBe(true);
  expect(next.introControl?.media.enabled).toBe(false);
});

it('does not offer an unwired join preview even when a remembered asset is active', async () => {
  retained();
  props.onJoinPreview = undefined;
  await render();
  expect(button('Preview transition to video', section()).disabled).toBe(true);
});

it('hides sound controls when the admitted video has no audio track', async () => {
  preview.audio = false;
  retained('video');
  await render();
  expect(field('Volume')).toBeNull();
  expect(section().textContent).not.toContain('Bookend audio');
  expect(field('Trim start')).not.toBeNull();
});

it('persists duration after the parent echoes each preview and survives inspector remount', async () => {
  retained();
  function Controlled() {
    const [draft, setDraft] = useState<ReviewPresentationInspectorProps['settings'] | null>(null);
    return (
      <ReviewPresentationInspector
        {...props}
        settings={draft ?? props.settings}
        onPreview={setDraft}
        onChange={(settings) => {
          props.onChange(settings);
          props.settings = settings;
        }}
      />
    );
  }
  await act(async () => root.render(<Controlled />));
  const range = field('Duration range');
  act(() =>
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(range.value).toBe('3.1');
  expect(props.settings.intro.image!.duration).toBe(3);
  act(() => range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })));
  expect(props.onChange).toHaveBeenCalledOnce();
  expect(props.settings.intro.image!.duration).toBe(3.1);
  await act(async () => root.render(null));
  await render();
  expect(field('Duration range').value).toBe('3.1');
});

it('configures and removes a join independently of the opposite edge and media', async () => {
  retained();
  props.settings.outroTransition = { type: 'dissolve', before: 0.1, after: 0.3 };
  await render();
  async function choose(option: string) {
    act(() => button('Transition to video', section()).click());
    const node = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (item) => item.textContent === option
    )!;
    await act(async () => node.click());
  }
  await choose('Dissolve');
  expect(props.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      introTransition: { type: 'dissolve', before: 0.2, after: 0.2 },
      outroTransition: props.settings.outroTransition,
      intro: props.settings.intro,
    })
  );
  props.settings.introTransition = { type: 'dissolve', before: 0.2, after: 0.2 };
  await render();
  const field = await type('Before join', '0.5');
  accept(field);
  expect(props.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      introTransition: { type: 'dissolve', before: 0.5, after: 0.2 },
    })
  );
  await choose('Fade through color');
  expect(props.onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      introTransition: { type: 'fade-black', before: 0.2, after: 0.2 },
    })
  );
  props.settings.introTransition.type = 'fade-black';
  await render();
  expect(section().textContent).toContain('Transition color');
  await choose('None');
  const last = vi.mocked(props.onChange).mock.calls.at(-1)![0];
  expect(last).not.toHaveProperty('introTransition');
  expect(last.outroTransition).toEqual(props.settings.outroTransition);
  expect(last.intro).toEqual(props.settings.intro);
});
