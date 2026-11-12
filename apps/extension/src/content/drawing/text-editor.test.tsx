// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingTextEditor, useDrawingTextEditor, type DrawingTextDraft } from './text-editor';
import { createContentDrawingController } from './controller';
import { createDrawingSession } from '../../features/drawing/public';
import { DrawingTextBackgrounds, useDrawingTextLayout } from './text-content';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['#00000000', '#00000080', '#111827'])(
  'keeps the insertion caret independent of glyph color %s',
  (color) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <DrawingTextEditor
            draft={{ id: null, point: { x: 20, y: 30 }, value: 'Caret', width: 160 }}
            projection={{ x: 0, y: 0 }}
            style={{ backgroundColor: '#f97316', color, fontFamily: 'sans', fontSize: 24 }}
            onCancel={vi.fn()}
            onChange={vi.fn()}
            onCommit={vi.fn()}
          />
        )
      );
      const input = host.querySelector('textarea')!;
      expect(input.style.caretColor).toBe('rgb(37, 99, 235)');
      expect(input.value).toBe('Caret');
      expect(input.selectionStart).toBe(5);
    } finally {
      act(() => root.unmount());
    }
  }
);

it.each(['#ff8800', '#ff880080'])(
  'uses one background paint for adjacent lines with %s',
  (color) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      act(() =>
        root.render(
          <DrawingTextBackgrounds
            color={color}
            rects={[
              { left: 0, top: 2, width: 100, height: 25 },
              { left: 0, top: 27, width: 60, height: 25 },
            ]}
          />
        )
      );
      const paths = host.querySelectorAll('svg > path');
      expect(paths).toHaveLength(1);
      expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
      expect(host.querySelector('svg')?.style.color).not.toBe('');
      const path = paths[0]?.getAttribute('d');
      expect(path?.match(/M /g)).toHaveLength(1);
      expect(path).toContain('L 100 24 A 3 3 0 0 1 97 27');
      expect(path).toContain('L 60 27 A 0 0 0 0 1 60 27');
      expect(path).toContain('L 60 49 A 3 3 0 0 1 57 52');
    } finally {
      act(() => root.unmount());
    }
  }
);

it('does not interpret a background color as an SVG paint server', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <DrawingTextBackgrounds
          color="url(https://example.invalid/paint.svg#fill)"
          rects={[{ left: 0, top: 2, width: 100, height: 25 }]}
        />
      )
    );
    expect(host.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    expect(host.querySelector('svg')?.style.color).toBe('');
  } finally {
    act(() => root.unmount());
  }
});

it('publishes a changed text draft before it enters shared Drawing history', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const listener = vi.fn();
  const unsubscribe = controller.subscribePendingTextChange?.(listener);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor: ReturnType<typeof useDrawingTextEditor>;
  function Harness() {
    editor = useDrawingTextEditor(controller);
    return null;
  }
  act(() => root.render(<Harness />));
  act(() => editor!.setDraft({ id: null, point: { x: 0, y: 0 }, value: '' }));
  expect(controller.hasPendingTextChange?.()).toBe(false);
  act(() => editor!.setDraft({ id: null, point: { x: 0, y: 0 }, value: 'Draft' }));
  expect(controller.hasPendingTextChange?.()).toBe(true);
  expect(session.getSnapshot().document.objects).toHaveLength(0);
  expect(listener).toHaveBeenCalledOnce();
  act(() => editor!.cancel());
  expect(controller.hasPendingTextChange?.()).toBe(false);
  act(() => editor!.setDraft({ id: null, point: { x: 0, y: 0 }, value: 'Draft' }));
  act(() => editor!.finalize());
  expect(controller.hasPendingTextChange?.()).toBe(false);
  expect(session.getSnapshot().document.objects.at(-1)).toMatchObject({ text: 'Draft' });
  unsubscribe?.();
  act(() => root.unmount());
});

it('retains a text draft when shared Drawing history rejects its commit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => false });
  const controller = createContentDrawingController(session);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor: ReturnType<typeof useDrawingTextEditor>;
  function Harness() {
    editor = useDrawingTextEditor(controller);
    return null;
  }
  act(() => root.render(<Harness />));
  act(() =>
    editor!.setDraft({
      id: null,
      point: { x: 0, y: 0 },
      value: 'Keep me',
      width: 320,
      fittedWidth: 70,
    })
  );
  act(() => editor!.finalize());
  expect(editor!.draft?.value).toBe('Keep me');
  expect(controller.hasPendingTextChange?.()).toBe(true);
  expect(session.getSnapshot().document.objects).toHaveLength(0);
  act(() => root.unmount());
});

it('keeps the first line visible while Shift+Enter creates an empty trailing line', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const initialDraft: DrawingTextDraft = {
    autoWidth: false,
    height: 29,
    id: 'text',
    point: { x: 20, y: 30 },
    value: 'Stable text',
    width: 180,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness(props: { layoutRevision: number }) {
    const [draft, setDraft] = useState(initialDraft);
    return (
      <DrawingTextEditor
        draft={draft}
        layoutRevision={props.layoutRevision}
        projection={{ x: 0, y: 0 }}
        style={{
          backgroundColor: '#fef08a',
          color: '#111827',
          fontFamily: 'sans',
          fontSize: 20,
        }}
        onCancel={vi.fn()}
        onChange={setDraft}
        onCommit={vi.fn()}
      />
    );
  }
  act(() => root.render(<Harness layoutRevision={0} />));
  const editor = host.querySelector<HTMLTextAreaElement>('[data-ui="content.drawing.text-input"]')!;

  editor.setSelectionRange(editor.value.length, editor.value.length);
  Object.defineProperty(editor, 'scrollTop', { configurable: true, value: 25, writable: true });
  const shiftEnter = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
    shiftKey: true,
  });
  act(() => editor.dispatchEvent(shiftEnter));

  expect(shiftEnter.defaultPrevented).toBe(false);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(editor, 'Stable text\n');
    editor.setSelectionRange('Stable text\n'.length, 'Stable text\n'.length);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
  });
  editor.scrollTop = 25;
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(editor.value).toBe('Stable text\n');
  expect(editor.selectionStart).toBe(editor.value.length);
  expect(editor.scrollTop).toBe(0);
  const backgrounds = host.querySelectorAll('[data-ui="content.drawing.text-background"]');
  expect(backgrounds).toHaveLength(1);
  expect(backgrounds[0]?.getAttribute('d')?.match(/M /g)).toHaveLength(1);
  const firstPath = backgrounds[0]?.getAttribute('d');
  expect(firstPath).toBeTruthy();

  const zoomKey = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: '+',
    shiftKey: true,
  });
  act(() => editor.dispatchEvent(zoomKey));
  expect(zoomKey.defaultPrevented).toBe(false);
  act(() => root.render(<Harness layoutRevision={1} />));
  editor.scrollTop = 25;
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  expect(editor.scrollTop).toBe(0);
  act(() => root.unmount());
});

it.each(['', '\nAlpha\n\n \t \nBeta\n'])('paints only populated draft rows for %j', (value) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <DrawingTextEditor
          draft={{ id: null, point: { x: 20, y: 30 }, value, width: 200 }}
          projection={{ x: 0, y: 0 }}
          style={{ backgroundColor: '#ff8800', color: '#111111', fontFamily: 'sans', fontSize: 20 }}
          onCancel={vi.fn()}
          onChange={vi.fn()}
          onCommit={vi.fn()}
        />
      )
    );
    const path =
      host.querySelector('[data-ui="content.drawing.text-background"]')?.getAttribute('d') ?? '';
    expect(path.match(/M /g)?.length ?? 0).toBe(value ? 2 : 0);
    expect(host.querySelector('textarea')?.value).toBe(value);
  } finally {
    act(() => root.unmount());
  }
});

it('preserves source whitespace, empty lines and the explicit wrapping mode', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor!: ReturnType<typeof useDrawingTextEditor>;
  function Harness() {
    editor = useDrawingTextEditor(controller);
    return null;
  }
  act(() => root.render(<Harness />));
  try {
    act(() =>
      editor.setDraft({
        id: null,
        value: '  Word  \n\n',
        point: { x: 10, y: 20 },
        autoWidth: true,
        maxWidth: 400,
      })
    );
    act(() => editor.commit());
    expect(session.getCommittedDocument().objects[0]).toMatchObject({
      text: '  Word  \n\n',
      autoWidth: true,
      wrapWidth: 400,
    });
    const object = session.getCommittedDocument().objects[0];
    if (object?.kind !== 'text') throw new Error('Expected text');
    act(() => editor.edit(object));
    act(() => editor.setDraft({ ...editor.draft!, value: 'Changed' }));
    act(() => editor.cancel());
    expect(session.getCommittedDocument().objects[0]).toBe(object);
  } finally {
    act(() => root.unmount());
  }
});
it('ignores obsolete font completion after shortening and unmounting', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const completions: Array<(value: unknown[]) => void> = [];
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: () => false,
      load: () => new Promise<unknown[]>((resolve) => completions.push(resolve)),
    },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const rendered = vi.fn();
  function Probe({ value }: { value: string }) {
    const layout = useDrawingTextLayout({
      value,
      fontFamily: 'sans-serif',
      fontSize: 24,
      wrapWidth: 320,
      autoWidth: true,
    });
    rendered(value);
    return <span>{layout.lines.join('\n')}</span>;
  }
  try {
    act(() => root.render(<Probe value="Old long value" />));
    act(() => root.render(<Probe value="B" />));
    const calls = rendered.mock.calls.length;
    await act(async () => {
      completions[0]!([{}]);
      await Promise.resolve();
    });
    expect(rendered).toHaveBeenCalledTimes(calls);
    await act(async () => {
      completions[1]!([{}]);
      await Promise.resolve();
    });
    expect(host.textContent).toBe('B');
    expect(rendered).toHaveBeenCalledTimes(calls + 1);
    act(() => root.unmount());
    await act(async () => {
      completions[1]!([{}]);
      await Promise.resolve();
    });
    expect(rendered).toHaveBeenCalledTimes(calls + 1);
  } finally {
    Reflect.deleteProperty(document, 'fonts');
  }
});
