// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ToolbarResetConfirmControl } from './reset-confirm';
import { useToolbarMenuState } from '../state/menu';
import type { PagePreparationResetScope } from '../../../parser/page-preparation/history';

vi.mock('../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let root: Root | undefined;
let host: HTMLElement | undefined;
let scope: ShadowRoot;
const confirm = vi.fn();
function Harness({
  available = true,
  resetScope = 'all',
}: {
  available?: boolean;
  resetScope?: PagePreparationResetScope;
}) {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <div className="sniptale-toolbar-root">
      <ToolbarResetConfirmControl
        available={available}
        scope={resetScope}
        displayMode="horizontal"
        toolbarMenuState={toolbarMenuState}
        onConfirm={confirm}
      />
    </div>
  );
}
function render(available = true) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    scope = host.attachShadow({ mode: 'open' });
    root = createRoot(scope);
  }
  act(() => root?.render(<Harness available={available} />));
}
function trigger() {
  return scope.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.reset-all-button"]')!;
}
function actions() {
  return scope.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button');
}
function click(button: HTMLButtonElement, detail = 1) {
  act(() =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail }))
  );
}
function key(button: HTMLButtonElement, key: string, shiftKey = false) {
  act(() =>
    button.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key, shiftKey })
    )
  );
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  confirm.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('requires explicit confirmation and calls the reset once', () => {
  render();
  click(trigger());
  expect(confirm).not.toHaveBeenCalled();
  const reset = actions()[1]!;
  act(() => {
    reset.click();
    reset.click();
  });
  expect(confirm).toHaveBeenCalledOnce();
  expect(actions()).toHaveLength(0);
});
it('Cancel and outside pointer close without resetting or stealing focus', () => {
  render();
  click(trigger());
  click(actions()[0]!);
  expect(confirm).not.toHaveBeenCalled();
  click(trigger());
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(actions()).toHaveLength(0);
  expect(confirm).not.toHaveBeenCalled();
});
it('enters Cancel for keyboard activation, cycles Tab in Shadow DOM, and restores on shared Escape', () => {
  render();
  click(trigger(), 0);
  expect(scope.activeElement).toBe(actions()[0]);
  key(actions()[0]!, 'Tab', true);
  expect(scope.activeElement).toBe(actions()[1]);
  key(actions()[1]!, 'Tab');
  expect(scope.activeElement).toBe(actions()[0]);
  key(actions()[0]!, 'Escape');
  expect(actions()).toHaveLength(0);
  expect(scope.activeElement).toBe(trigger());
  expect(confirm).not.toHaveBeenCalled();
});
it('does not programmatically focus actions after a mouse click', () => {
  render();
  click(trigger());
  expect(scope.activeElement).not.toBe(actions()[0]);
});
it('availability loss invalidates a mounted confirmation', () => {
  render();
  click(trigger());
  const stale = actions()[1]!;
  render(false);
  click(stale);
  expect(actions()).toHaveLength(0);
  expect(trigger().disabled).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  render();
  expect(actions()).toHaveLength(0);
});
it('unmount closes its identity so another consumer does not inherit a confirmation', () => {
  function Owner({ show }: { show: boolean }) {
    const toolbarMenuState = useToolbarMenuState();
    return (
      <>
        <output>{toolbarMenuState.activeMenuType}</output>
        {show ? (
          <ToolbarResetConfirmControl
            available
            displayMode="horizontal"
            toolbarMenuState={toolbarMenuState}
            onConfirm={confirm}
          />
        ) : null}
      </>
    );
  }
  render();
  act(() => root?.render(<Owner show />));
  click(trigger());
  expect(scope.querySelector('output')?.textContent).toBe('reset-confirm');
  act(() => root?.render(<Owner show={false} />));
  expect(scope.querySelector('output')?.textContent).toBe('');
  expect(confirm).not.toHaveBeenCalled();
});

it('places the vertical popup using layout height unaffected by entrance animation', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 1180,
    y: 620,
    left: 1180,
    top: 620,
    right: 1216,
    bottom: 656,
    width: 36,
    height: 36,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(174);
  vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('innerWidth', 1280);
  function Vertical() {
    const toolbarMenuState = useToolbarMenuState();
    return (
      <ToolbarResetConfirmControl
        available
        displayMode="vertical"
        toolbarMenuState={toolbarMenuState}
        onConfirm={confirm}
      />
    );
  }
  render();
  act(() => root?.render(<Vertical />));
  click(trigger());
  expect(scope.querySelector<HTMLElement>('.sniptale-popover-menu')?.style.top).toBe('-82px');
});

it.each([
  ['all', 'resetPagePreparationMessage'],
  ['drawing', 'resetDrawingMessage'],
  ['annotation', 'resetAnnotationMessage'],
  ['content-editing', 'resetContentEditingMessage'],
  ['design-review', 'resetDesignReviewMessage'],
] as const)('confirms only the advertised %s scope', (resetScope, message) => {
  render();
  act(() => root?.render(<Harness resetScope={resetScope} />));
  click(trigger());
  expect(scope.querySelector('[role="alertdialog"]')?.textContent).toContain(
    `content.toolbar.${message}`
  );
});
