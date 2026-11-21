// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  ANNOTATION_TEXT_TEMPLATES_KEY,
  createBrowserReviewTextTemplateStorage,
} from '../../composition/persistence/annotation-text-templates/storage';
import { installPersistenceLockManagerForTests } from '../../composition/persistence/infrastructure/mutation-barrier';
import { reviewBuiltinTextTemplates } from '../../features/video/review/annotation-effects/text-templates';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import { prepareTranslations, translate, type AppLocale } from '../../platform/i18n';
import { catalogFixtureMessages } from '../../platform/i18n/catalog-fixture.test-support';
import type { ReviewAnnotationEditing } from './annotation-effects-overlay';
import { ReviewAnnotationTextInspector } from './annotation-text-inspector';
import { ReviewAnnotationTextOverlay } from './annotation-text-overlay';
import { ReviewInspectorPresentation } from './inspector-sections';

vi.mock('../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: async (locale: AppLocale) => catalogFixtureMessages(locale),
}));

beforeAll(async () => {
  await prepareTranslations('gallery', 'en');
});

let root: Root;
let host: HTMLDivElement;
const size = { width: 640, height: 360 };
const labels = (name: Parameters<typeof translate>[0]) => translate(name);
const title = createReviewAnnotationTextClip('title', 'Title', 1, 4, 0);
function fixture() {
  const lane = { enabled: true, instances: [], textClips: [title] };
  const editor = {
    lane,
    previewLane: lane,
    pending: false,
    failure: null,
    gestureId: null,
    geometry: { read: () => null, subscribe: () => () => undefined },
    refreshBodyGeometry: vi.fn(),
    bodyMeasurements: new Map(),
    placementGestureActive: false,
    movement: { subscribe: vi.fn(() => () => undefined) },
    setGeometry: vi.fn(),
    add: vi.fn(),
    addText: vi.fn(),
    change: vi.fn(),
    changeText: vi.fn<ReviewAnnotationEditing['editor']['changeText']>(),
    enabled: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    beginGesture: vi.fn(() => true),
    previewMovement: vi.fn(() => false),
    previewGesture: vi.fn(),
    cancelGesture: vi.fn(),
    commitGesture: vi.fn(async () => true),
    hasPending: vi.fn(() => false),
    flush: vi.fn(async () => undefined),
    retry: vi.fn(),
  } satisfies ReviewAnnotationEditing['editor'];
  const binding = {
    editor,
    snapshots: [],
    segments: [],
    time: 2,
    selectedId: title.id,
    busy: false,
    onSelect: vi.fn(),
  } satisfies ReviewAnnotationEditing;
  return { binding, editor };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  installPersistenceLockManagerForTests(null);
});

function input(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(node: EventTarget, name: string, shiftKey = false) {
  node.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));
}
function field(name: Parameters<typeof translate>[0], index = 0) {
  const node = host.querySelectorAll<HTMLInputElement>(`input[aria-label="${labels(name)}"]`)[
    index
  ];
  if (!node) throw new Error(`Missing numeric parameter ${name}`);
  return node;
}
function setValue(name: Parameters<typeof translate>[0], text: string, index = 0) {
  const node = field(name, index);
  act(() => {
    node.focus();
    input(node, text);
    key(node, 'Enter');
  });
}

async function choose(
  control: Parameters<typeof translate>[0],
  option: Parameters<typeof translate>[0]
) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-haspopup="listbox"][aria-label="${labels(control)}"]`
  );
  if (!button) throw new Error(`Missing selector ${control}`);
  await act(async () => button.click());
  const target = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent?.trim() === labels(option)
  );
  if (!target) throw new Error(`Missing choice ${option}`);
  await act(async () => target.click());
}

it('applies independent phase options and exposes only the settings each active preset uses', async () => {
  const { editor } = fixture();
  let value = title;
  function Harness() {
    const [clip, setClip] = useState(title);
    value = clip;
    const lane = { ...editor.lane, textClips: [clip] };
    return (
      <ReviewInspectorPresentation value="all">
        <ReviewAnnotationTextInspector
          clip={clip}
          busy={false}
          editor={{
            ...editor,
            lane,
            previewLane: lane,
            changeText: (_id, edit) => setClip(edit),
          }}
        />
      </ReviewInspectorPresentation>
    );
  }
  act(() => root.render(<Harness />));
  expect(
    host.querySelector(`[aria-label="${labels('gallery.videoReview.annotationTextPeriod')}"]`)
  ).toBeNull();
  await choose(
    'gallery.videoReview.annotationTextEntrance',
    'gallery.videoReview.annotationTextPreset_slide'
  );
  await choose(
    'gallery.videoReview.annotationTextDirection',
    'gallery.videoReview.annotationTextDirection_left'
  );
  await choose(
    'gallery.videoReview.annotationTextLoop',
    'gallery.videoReview.annotationTextPreset_shine'
  );
  await choose(
    'gallery.videoReview.annotationTextExit',
    'gallery.videoReview.annotationTextPreset_cascade'
  );
  setValue('gallery.videoReview.annotationTextPhaseTime', '0.6');
  setValue('gallery.videoReview.annotationTextPhaseTime', '0.9', 1);
  setValue('gallery.videoReview.annotationTextDistance', '24');
  setValue('gallery.videoReview.annotationTextStagger', '70');
  setValue('gallery.videoReview.annotationTextPeriod', '2.5');
  setValue('gallery.videoReview.annotationTextAmount', '60');
  setValue('gallery.videoReview.annotationTextFontSize', '11');
  expect(value).toMatchObject({
    entrance: { preset: 'slide', direction: 'left', duration: 0.6, distance: 0.24 },
    loop: { preset: 'shine', period: 2.5, amount: 0.6 },
    exit: { preset: 'cascade', duration: 0.9, stagger: 0.7 },
    fontSize: 0.11,
  });
  await choose(
    'gallery.videoReview.annotationTextLoop',
    'gallery.videoReview.annotationTextPreset_none'
  );
  expect(value.loop).toEqual({ preset: 'none', period: 2.5, amount: 0.6 });
});

function mountEditableTitle() {
  const { editor } = fixture();
  let value = title;
  let restoreClip: (clip: typeof title) => void = () => undefined;
  function Harness() {
    const [clip, setClip] = useState(title);
    value = clip;
    restoreClip = setClip;
    return (
      <ReviewInspectorPresentation value="all">
        <ReviewAnnotationTextInspector
          clip={clip}
          busy={false}
          editor={{ ...editor, changeText: (_id, edit) => setClip(edit) }}
        />
      </ReviewInspectorPresentation>
    );
  }
  return {
    render: () => act(async () => root.render(<Harness />)),
    read: () => value,
    restore: (clip: typeof title) => act(() => restoreClip(clip)),
  };
}

function button(name: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.getAttribute('aria-label') === name || button.title === name
  );
  if (!node) throw new Error(`Missing button ${name}`);
  return node;
}

it('applies a template and edits font, marker and outline independently of its timing', async () => {
  const mounted = mountEditableTitle();
  await mounted.render();
  await act(async () =>
    button(labels('gallery.videoReview.annotationTextTemplate_marker')).click()
  );
  expect(mounted.read()).toMatchObject({
    start: title.start,
    end: title.end,
    text: title.text,
    transform: title.transform,
    entrance: { preset: 'cascade' },
    appearance: { background: { mode: 'marker' } },
  });
  await choose(
    'gallery.videoReview.annotationTextFamily',
    'gallery.videoReview.annotationTextTypeface_oswald'
  );
  await choose(
    'gallery.videoReview.annotationTextAlign',
    'gallery.videoReview.annotationTextAlignRight'
  );
  setValue('gallery.videoReview.annotationTextLineHeight', '130');
  setValue('gallery.videoReview.annotationTextLetterSpacing', '4');
  setValue('gallery.videoReview.annotationTextOpacity', '70');
  setValue('gallery.videoReview.annotationTextPaddingX', '25');
  setValue('gallery.videoReview.annotationTextPaddingY', '10');
  act(() => button(labels('gallery.videoReview.annotationTextOutline')).click());
  setValue('gallery.videoReview.annotationTextOutlineWidth', '8');
  setValue('gallery.videoReview.annotationTextOutlineOpacity', '80');
  act(() => button(labels('gallery.videoReview.annotationTextShadow')).click());
  setValue('gallery.videoReview.annotationTextShadowOpacity', '40');
  expect(mounted.read().appearance).toMatchObject({
    family: 'oswald',
    weight: 700,
    align: 'right',
    lineHeight: 1.3,
    letterSpacing: 0.04,
    background: { mode: 'marker', opacity: 0.7, paddingX: 0.25, paddingY: 0.1 },
    outline: { enabled: true, width: 0.08, opacity: 0.8 },
    shadow: { enabled: true, opacity: 0.4 },
  });
  await choose(
    'gallery.videoReview.annotationTextBackgroundMode',
    'gallery.videoReview.annotationTextTemplate_block'
  );
  setValue('gallery.videoReview.annotationTextRadius', '35');
  expect(mounted.read().appearance?.background).toMatchObject({ mode: 'block', radius: 0.35 });
});

function templateProfile() {
  let storage: Record<string, unknown> = {};
  let refuse = false;
  let refuseRead = false;
  const changes = {
    addListener: vi.fn<(listener: (value: object, area: string) => void) => void>(),
    removeListener: vi.fn(),
  };
  vi.stubGlobal('chrome', {
    runtime: {},
    storage: {
      onChanged: changes,
      local: {
        get: (keys: string[] | null, callback: (record: object) => void) => {
          if (refuseRead && keys?.includes(ANNOTATION_TEXT_TEMPLATES_KEY))
            throw new Error('Profile read unavailable');
          callback(storage);
        },
        set: (next: Record<string, unknown>, callback: () => void) => {
          if (refuse) throw new Error('Storage offline');
          storage = next;
          callback();
        },
      },
    },
  });
  installPersistenceLockManagerForTests({
    request: async (_name, _options, task) => task({}),
  });
  return {
    listen: (area: string) => changes.addListener.mock.lastCall?.[0](storage, area),
    fail: (value: boolean) => {
      refuse = value;
    },
    failRead: (value: boolean) => {
      refuseRead = value;
    },
    read: () => storage[ANNOTATION_TEXT_TEMPLATES_KEY],
  };
}

it('saves, updates and removes profile templates without altering the current clip', async () => {
  const profile = templateProfile();
  const mounted = mountEditableTitle();
  await mounted.render();
  await act(async () => profile.listen('sync'));
  await act(async () => profile.listen('local'));
  await act(async () =>
    button(labels('gallery.videoReview.annotationTextTemplate_marker')).click()
  );
  const clip = mounted.read();
  const save = () => button(labels('gallery.videoReview.annotationTextTemplateSave'));
  const submit = () => button(labels('gallery.videoReview.annotationTextTemplateConfirm'));
  const name = () => field('gallery.videoReview.annotationTextTemplateName');
  act(() => save().click());
  expect(submit().disabled).toBe(true);
  act(() => input(name(), 'Мой стиль'));
  profile.fail(true);
  await act(async () => submit().click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    labels('gallery.videoReview.annotationTextTemplateFailed')
  );
  profile.fail(false);
  await act(async () => submit().click());
  expect(profile.read()).toMatchObject({ version: 1, records: [{ name: 'Мой стиль' }] });
  expect(button('Мой стиль').getAttribute('aria-pressed')).toBe('true');
  act(() => button(labels('gallery.videoReview.annotationTextTemplateUpdate')).click());
  act(() => input(name(), 'Заголовок'));
  await act(async () => submit().click());
  expect(profile.read()).toMatchObject({ records: [{ name: 'Заголовок' }] });
  act(() => save().click());
  act(() => button(labels('gallery.videoReview.annotationTextTemplateCancel')).click());
  expect(host.querySelector('form')).toBeNull();
  await act(async () => button(labels('gallery.videoReview.annotationTextTemplateDelete')).click());
  expect(profile.read()).toMatchObject({ records: [] });
  expect(mounted.read()).toBe(clip);
});

it('deletes the personal template marked active after Undo restores a different title style', async () => {
  const profile = templateProfile();
  const mounted = mountEditableTitle();
  await mounted.render();
  const save = async (name: string) => {
    act(() => button(labels('gallery.videoReview.annotationTextTemplateSave')).click());
    act(() => input(field('gallery.videoReview.annotationTextTemplateName'), name));
    await act(async () =>
      button(labels('gallery.videoReview.annotationTextTemplateConfirm')).click()
    );
  };
  await act(async () =>
    button(labels('gallery.videoReview.annotationTextTemplate_marker')).click()
  );
  setValue('gallery.videoReview.annotationTextFontSize', '9');
  await save('Маркер проекта');
  await act(async () => button(labels('gallery.videoReview.annotationTextTemplate_block')).click());
  setValue('gallery.videoReview.annotationTextFontSize', '10');
  await save('Плашка проекта');
  await act(async () => button('Маркер проекта').click());
  const before = mounted.read();
  await act(async () => button('Плашка проекта').click());
  mounted.restore(before);
  expect(button('Маркер проекта').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button(labels('gallery.videoReview.annotationTextTemplateDelete')).click());
  expect(profile.read()).toMatchObject({ records: [{ name: 'Плашка проекта' }] });
  expect(mounted.read()).toBe(before);
});

it('retries a new template after another window deletes a different record', async () => {
  const profile = templateProfile();
  const external = createBrowserReviewTextTemplateStorage();
  const record = {
    id: crypto.randomUUID(),
    name: 'Ярлык',
    template: reviewBuiltinTextTemplates.marker,
  };
  await external.change({ ...record, type: 'create', afterDeletion: null });
  const previous = (await external.load()).records[0]!;
  const mounted = mountEditableTitle();
  await mounted.render();
  act(() => button(labels('gallery.videoReview.annotationTextTemplateSave')).click());
  const name = field('gallery.videoReview.annotationTextTemplateName');
  act(() => input(name, 'Свежий заголовок'));
  await external.change({ type: 'delete', id: previous.id, previous: previous.revision });
  const confirm = () => button(labels('gallery.videoReview.annotationTextTemplateConfirm'));
  await act(async () => confirm().click());
  expect(profile.read()).toMatchObject({ records: [] });
  expect(name.value).toBe('Свежий заголовок');
  await act(async () => confirm().click());
  expect(profile.read()).toMatchObject({ records: [{ name: 'Свежий заголовок' }] });
});

it('requires explicit confirmation of the refreshed target after a concurrent update', async () => {
  const profile = templateProfile();
  const external = createBrowserReviewTextTemplateStorage();
  const saved = {
    id: crypto.randomUUID(),
    name: 'Версия 1',
    template: reviewBuiltinTextTemplates.marker,
  };
  await external.change({ ...saved, type: 'create', afterDeletion: null });
  const previous = (await external.load()).records[0]!;
  const mounted = mountEditableTitle();
  await mounted.render();
  await act(async () => button(saved.name).click());
  act(() => button(labels('gallery.videoReview.annotationTextTemplateUpdate')).click());
  const name = field('gallery.videoReview.annotationTextTemplateName');
  act(() => input(name, 'Моя версия'));
  await external.change({
    ...saved,
    type: 'update',
    previous: previous.revision,
    name: 'Версия 2',
  });
  const confirm = () => button(labels('gallery.videoReview.annotationTextTemplateConfirm'));
  await act(async () => confirm().click());
  expect(profile.read()).toMatchObject({ records: [{ name: 'Версия 2' }] });
  expect(name.value).toBe('Моя версия');
  expect(confirm().disabled).toBe(true);
  act(() => button(labels('gallery.videoReview.annotationTextTemplateReload')).click());
  expect(name.value).toBe('Моя версия');
  expect(document.activeElement).toBe(name);
  await act(async () => confirm().click());
  expect(profile.read()).toMatchObject({ records: [{ name: 'Моя версия' }] });

  const updated = (await external.load()).records[0]!;
  act(() => button(labels('gallery.videoReview.annotationTextTemplateUpdate')).click());
  act(() => input(field('gallery.videoReview.annotationTextTemplateName'), 'Отдельная версия'));
  await external.change({ type: 'delete', id: updated.id, previous: updated.revision });
  await act(async () => confirm().click());
  expect(confirm().disabled).toBe(true);
  act(() => button(labels('gallery.videoReview.annotationTextTemplateSaveNew')).click());
  expect(profile.read()).toMatchObject({ records: [] });
  expect(field('gallery.videoReview.annotationTextTemplateName').value).toBe('Отдельная версия');
  await act(async () => confirm().click());
  const replacement = (await external.load()).records[0]!;
  expect(replacement.name).toBe('Отдельная версия');
  expect(replacement.id).not.toBe(updated.id);
});

it('retries deletion only against its original identity after the selected style changes', async () => {
  const profile = templateProfile();
  const external = createBrowserReviewTextTemplateStorage();
  const first = {
    id: crypto.randomUUID(),
    name: 'Первый маркер $&',
    template: { ...reviewBuiltinTextTemplates.marker, fontSize: 0.11 },
  };
  const second = { ...first, id: crypto.randomUUID(), name: 'Второй маркер' };
  await external.change({ ...first, type: 'create', afterDeletion: null });
  await external.change({ ...second, type: 'create', afterDeletion: null });
  const original = (await external.load()).records[0]!;
  const mounted = mountEditableTitle();
  await mounted.render();
  await act(async () => button(first.name).click());
  act(() => button(labels('gallery.videoReview.annotationTextTemplateSave')).click());
  act(() => input(field('gallery.videoReview.annotationTextTemplateName'), 'Новый черновик'));
  const changed = {
    ...first,
    name: 'Обновлённый-маркер-'.repeat(3) + '$& архив',
    template: { ...first.template, fontSize: 0.15 },
  };
  await external.change({ ...changed, type: 'update', previous: original.revision });
  const remove = () => button(labels('gallery.videoReview.annotationTextTemplateDelete'));
  await act(async () => remove().click());
  expect(profile.read()).toMatchObject({ records: [{ id: first.id }, { id: second.id }] });
  expect(button(second.name).getAttribute('aria-pressed')).toBe('true');
  expect(remove().disabled).toBe(true);
  const retry = labels('gallery.videoReview.annotationTextTemplateDeleteNamed').replace(
    '{name}',
    () => changed.name
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(changed.name);
  expect(button(retry).textContent).toBe(
    labels('gallery.videoReview.annotationTextTemplateDelete')
  );
  await act(async () => button(retry).click());
  expect(profile.read()).toMatchObject({ records: [{ id: second.id }] });
  expect(field('gallery.videoReview.annotationTextTemplateName').value).toBe('Новый черновик');
});

it('reloads the catalog in the inspector before retrying a failed deletion', async () => {
  const profile = templateProfile();
  const external = createBrowserReviewTextTemplateStorage();
  const saved = {
    id: crypto.randomUUID(),
    name: 'Мой маркер',
    template: reviewBuiltinTextTemplates.marker,
  };
  await external.change({ ...saved, type: 'create', afterDeletion: null });
  const mounted = mountEditableTitle();
  await mounted.render();
  await act(async () => button(saved.name).click());
  profile.failRead(true);
  await act(async () => button(labels('gallery.videoReview.annotationTextTemplateDelete')).click());
  expect(profile.read()).toMatchObject({ records: [{ id: saved.id }] });
  profile.failRead(false);
  await act(async () =>
    button(labels('gallery.videoReview.annotationTextTemplatesReloadList')).click()
  );
  expect(profile.read()).toMatchObject({ records: [{ id: saved.id }] });
  const retry = labels('gallery.videoReview.annotationTextTemplateDeleteNamed').replace(
    '{name}',
    saved.name
  );
  await act(async () => button(retry).click());
  expect(profile.read()).toMatchObject({ records: [] });
});

it('keeps the latest profile templates when an older read finishes or fails later', async () => {
  const pending: ((value: Record<string, unknown>) => void)[] = [];
  const runtime: { lastError?: { message: string } } = {};
  const addListener = vi.fn<(listener: (value: object, area: string) => void) => void>();
  vi.stubGlobal('chrome', {
    runtime,
    storage: {
      local: {
        get: (keys: string[] | null, callback: (value: Record<string, unknown>) => void) => {
          if (keys?.includes(ANNOTATION_TEXT_TEMPLATES_KEY)) pending.push(callback);
          else callback({});
        },
      },
      onChanged: { addListener, removeListener: vi.fn() },
    },
  });
  const mounted = mountEditableTitle();
  await mounted.render();
  expect(addListener).toHaveBeenCalled();
  const change = { [ANNOTATION_TEXT_TEMPLATES_KEY]: {} };
  const refresh = () => {
    for (const [listener] of addListener.mock.calls) listener(change, 'local');
  };
  const stored = {
    [ANNOTATION_TEXT_TEMPLATES_KEY]: {
      version: 1,
      deletionRevision: null,
      records: [
        {
          id: crypto.randomUUID(),
          revision: crypto.randomUUID(),
          name: 'Новый шаблон',
          template: reviewBuiltinTextTemplates.marker,
        },
      ],
    },
  };
  await act(async () => {
    refresh();
    pending[1]!(stored);
    pending[0]!({});
  });
  expect(button('Новый шаблон')).toBeDefined();
  await act(async () => {
    refresh();
    refresh();
    pending[3]!(stored);
    runtime.lastError = { message: 'Profile read unavailable' };
    pending[2]!({});
    delete runtime.lastError;
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button('Новый шаблон')).toBeDefined();
});

it('cancels or confirms a text draft and routes retry through the editor', () => {
  const { editor } = fixture();
  const render = (overrides: Partial<ReviewAnnotationEditing['editor']> = {}) =>
    act(() =>
      root.render(
        <ReviewAnnotationTextInspector
          clip={title}
          editor={{ ...editor, ...overrides }}
          busy={false}
        />
      )
    );
  render();
  const text = host.querySelector('textarea')!;
  act(() => {
    text.focus();
    input(text, 'Unconfirmed');
    key(text, 'Escape');
  });
  expect(editor.beginGesture).toHaveBeenCalledWith(title.id, 'field');
  expect(editor.previewGesture).toHaveBeenCalledWith({ text: 'Unconfirmed' });
  expect(editor.cancelGesture).toHaveBeenCalledOnce();
  expect(editor.commitGesture).not.toHaveBeenCalled();
  render({ gestureId: title.id, previewLane: undefined });
  act(() => {
    text.focus();
    input(text, 'Confirmed');
    text.blur();
  });
  expect(editor.beginGesture).toHaveBeenCalledOnce();
  expect(editor.previewGesture).toHaveBeenCalledWith({ text: 'Confirmed' });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  render({ failure: 'save', pending: true });
  const retry = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${labels('gallery.videoReview.retry')}"]`
  )!;
  expect(retry.disabled).toBe(true);
  render({ failure: 'save' });
  act(() => retry.click());
  expect(editor.retry).toHaveBeenCalledOnce();
});

function renderOverlay(binding: ReviewAnnotationEditing) {
  act(() => root.render(<ReviewAnnotationTextOverlay binding={binding} size={size} />));
  const view = host.querySelector('svg');
  const target = view?.querySelector('rect');
  if (!view || !target) return null;
  vi.spyOn(view, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 360));
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  return target;
}
function pointer(node: SVGRectElement, type: string, x: number, y: number, id = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, 'pointerId', { value: id });
  act(() => node.dispatchEvent(event));
}

it('commits one viewport move per drag and cancels click, escape or lost capture', () => {
  const { binding, editor } = fixture();
  const rect = renderOverlay(binding)!;
  pointer(rect, 'pointerdown', 610, 250, 1, 2);
  expect(editor.beginGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 74, 46, 2);
  expect(editor.previewGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointermove', 74, 46);
  expect(editor.previewGesture).toHaveBeenLastCalledWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointerup', 74, 46);
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 10, 10);
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 74, 46);
  act(() => key(window, 'Escape'));
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'lostpointercapture', 74, 46);
  expect(editor.cancelGesture).toHaveBeenCalledTimes(3);
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it('moves with the keyboard after admission and hides the handle outside its half-open range', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  act(() => key(rect, 'Enter'));
  act(() => key(rect, 'ArrowRight', true));
  expect(admit).toHaveBeenCalledOnce();
  expect(editor.commitGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[0]![0]());
  expect(editor.previewGesture).toHaveBeenCalledWith({
    transform: { ...title.transform, x: title.transform.x + 10 / size.width },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  expect(renderOverlay({ ...binding, busy: true })?.getAttribute('aria-disabled')).toBe('true');
  expect(renderOverlay({ ...binding, time: 0.99 })).toBeNull();
  expect(renderOverlay({ ...binding, time: 4 })).toBeNull();
  expect(renderOverlay({ ...binding, selectedId: null })).toBeNull();
});

it('publishes the final drag point after delayed admission even when the pointer was released', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 42, 10);
  pointer(rect, 'pointerup', 74, 46);
  pointer(rect, 'lostpointercapture', 74, 46);
  expect(editor.previewGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[0]![0]());
  expect(editor.previewGesture).toHaveBeenCalledExactlyOnceWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it('cancels a released drag before delayed admission when the editor closes the selection', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 74, 46);
  renderOverlay({ ...binding, selectedId: null });
  act(() => admit.mock.calls[0]![0]());
  expect(editor.beginGesture).not.toHaveBeenCalled();
  expect(editor.commitGesture).not.toHaveBeenCalled();
});

it('starts a fresh drag after admission refused the released drag on the same title', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 80, 10);
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 74, 46);
  expect(admit).toHaveBeenCalledTimes(2);
  act(() => admit.mock.calls[0]![0]());
  expect(editor.commitGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[1]![0]());
  expect(editor.previewGesture).toHaveBeenCalledExactlyOnceWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'cancels a title drag on window blur with admission pending=%s',
  (pending) => {
    const { binding, editor } = fixture();
    const admit = vi.fn<(action: () => void) => void>();
    const rect = renderOverlay(pending ? { ...binding, beforeAction: admit } : binding)!;
    pointer(rect, 'pointerdown', 10, 10);
    pointer(rect, 'pointermove', 74, 46);
    act(() => window.dispatchEvent(new Event('blur')));
    pointer(rect, 'pointerup', 74, 46);
    if (pending) act(() => admit.mock.calls[0]![0]());
    expect(editor.commitGesture).not.toHaveBeenCalled();
    expect(editor.cancelGesture).toHaveBeenCalledTimes(pending ? 0 : 1);
    pointer(rect, 'pointerdown', 10, 10);
    pointer(rect, 'pointerup', 74, 46);
    if (pending) act(() => admit.mock.calls[1]![0]());
    expect(editor.commitGesture).toHaveBeenCalledOnce();
  }
);
