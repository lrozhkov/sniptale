// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesignReviewElementBar } from './element-bar';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const selection = {
  element: document.createElement('h1'),
  domPath: 'h1',
  kind: 'text' as const,
  patch: { declarations: [] },
  selectorLabel: 'h1',
  tagName: 'h1',
  textPreview: 'Heading',
};
const base = {
  deleteRequested: false,
  hasFeedback: true,
  onCopyPath: vi.fn(),
  onDeleteRequest: vi.fn(),
  onSettingsOpenChange: vi.fn(),
  selection,
  settingsOpen: false,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function copyButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Копировать данные элемента"]'
  )!;
}

it('confirms only successful copying on the icon and clears transient feedback', async () => {
  const copy = vi.fn(async () => true);
  act(() => root.render(<DesignReviewElementBar {...base} onCopyElement={copy} />));
  await act(async () => copyButton().click());
  expect(copyButton().querySelector('.lucide-check')).not.toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(copyButton().querySelector('.lucide-check')).toBeNull();
  copy.mockResolvedValue(false);
  await act(async () => copyButton().click());
  expect(copyButton().querySelector('.lucide-check')).toBeNull();
});

it('blocks duplicate copying and ignores completion after selection replacement', async () => {
  let complete = (_value: boolean) => {};
  const copy = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      })
  );
  act(() => root.render(<DesignReviewElementBar {...base} onCopyElement={copy} />));
  act(() => {
    copyButton().click();
    copyButton().click();
  });
  expect(copy).toHaveBeenCalledTimes(1);
  expect(copyButton().disabled).toBe(true);
  act(() =>
    root.render(
      <DesignReviewElementBar
        {...base}
        selection={{ ...selection, element: document.createElement('p') }}
        onCopyElement={copy}
      />
    )
  );
  await act(async () => complete(true));
  expect(copyButton().querySelector('.lucide-check')).toBeNull();
  expect(copyButton().disabled).toBe(false);
});

it('marks the properties button active only while properties are open', () => {
  const copy = async () => true;
  act(() => root.render(<DesignReviewElementBar {...base} settingsOpen onCopyElement={copy} />));
  const pencil = () => container.querySelector('button[aria-label="Изменить свойства элемента"]');
  expect(pencil()?.getAttribute('aria-pressed')).toBe('true');
  act(() => root.render(<DesignReviewElementBar {...base} onCopyElement={copy} />));
  expect(pencil()?.getAttribute('aria-pressed')).toBe('false');
});
