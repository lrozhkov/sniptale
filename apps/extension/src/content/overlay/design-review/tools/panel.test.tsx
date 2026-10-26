// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import { DesignReviewToolPanel } from './panel';

vi.mock('../../../platform/dom-host', () => ({ useContentUiScale: () => 1 }));
vi.mock('../popover/position', () => ({ useDesignReviewPopoverMetrics: () => null }));
vi.mock('../popover/drag', () => ({
  useDesignReviewPopoverDrag: (props: { basePosition: { left: number; top: number } }) => ({
    position: props.basePosition,
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  }),
}));
vi.mock('../settings/sections/tools', () => ({
  ReviewToolsSection: (props: { tool: string }) => <div data-tool-fields={props.tool} />,
}));
vi.mock('./measure', () => ({ DesignReviewMeasureSection: () => <div data-measure-fields /> }));

type Props = ComponentProps<typeof DesignReviewToolPanel>;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function createProps(): Props {
  return {
    tool: 'inspect',
    open: true,
    measureModel: { kind: 'incomplete', a: null, b: null, rectA: null, rectB: null },
    workspace: { collapsed: false, toggleCollapsed: vi.fn(), close: vi.fn(), comment: vi.fn() },
    actions: {
      close: vi.fn(),
      comment: {
        commit: vi.fn(() => true),
        endComposition: vi.fn(),
        startComposition: vi.fn(),
        updateDraft: vi.fn(),
      },
      copyElement: vi.fn(async () => true),
      copyPath: vi.fn(async () => undefined),
      navigateElement: vi.fn(),
      delete: vi.fn(),
      resetValue: vi.fn(),
      selectAction: vi.fn(),
      setSettingsOpen: vi.fn(),
      text: { edit: vi.fn(), reset: vi.fn() },
      updateValue: vi.fn(),
      updateValues: vi.fn(),
      voice: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() },
    },
    state: {
      action: 'refine',
      anchor: null,
      comment: { commitFailed: false, draft: '', marker: null },
      defaultValues: {},
      draftPatch: { declarations: [] },
      modifiedProperties: [],
      selection: null,
      settingsOpen: false,
      text: { editable: true, modified: false, preview: '', resettable: false },
      treeNavigation: { parent: null, child: null },
      values: {},
      voice: {
        active: false,
        pending: false,
        audioLevel: 0,
        caretPosition: null,
        errorCode: null,
        phase: 'idle',
      },
    },
  };
}
function selectElement(props: Props) {
  const parent = document.createElement('section');
  const element = document.createElement('div');
  parent.append(element);
  document.body.append(parent);
  props.state.selection = {
    element,
    domPath: 'section > div',
    selectorLabel: 'div',
    tagName: 'div',
    kind: 'text',
    patch: { declarations: [] },
    textPreview: '',
  };
  props.state.treeNavigation.parent = parent;
  return { parent, element };
}
function render(props: Props) {
  act(() => root.render(<DesignReviewToolPanel {...props} />));
}
function button(key: TranslationKey): HTMLButtonElement {
  const label = translate(key);
  const match = [...host.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
it('keeps Close and Collapse separate from element feedback and retains content while hidden', () => {
  const props = createProps();
  selectElement(props);
  render(props);
  act(() => button('content.designReview.workspaceCollapse').click());
  expect(props.workspace.toggleCollapsed).toHaveBeenCalledOnce();
  expect(props.workspace.close).not.toHaveBeenCalled();
  props.workspace.collapsed = true;
  render(props);
  expect(button('content.designReview.workspaceExpand').getAttribute('aria-expanded')).toBe(
    'false'
  );
  expect(
    host.querySelector<HTMLElement>('header')!.nextElementSibling?.getAttribute('style')
  ).toContain('display: none');
  act(() => button('content.designReview.workspaceExpand').click());
  act(() => button('content.designReview.close').click());
  expect(props.workspace.close).toHaveBeenCalledOnce();
  expect(props.actions.close).not.toHaveBeenCalled();
  props.workspace.collapsed = false;
  render(props);
  act(() => button('content.designReview.workspaceComment').click());
  expect(props.workspace.comment).toHaveBeenCalledOnce();
  props.open = false;
  render(props);
  expect(host.querySelector('aside')!.hidden).toBe(true);
  expect(host.querySelector('aside')!.style.display).toBe('none');
});
it('navigates to the exact parent or chosen child and disables missing directions', () => {
  const props = createProps();
  const { parent, element } = selectElement(props);
  const named = document.createElement('button');
  named.id = 'save';
  named.textContent = 'Save changes';
  const empty = document.createElement('img');
  element.append(named, empty);
  props.state.treeNavigation.children = [named, empty];
  render(props);
  act(() => button('content.designReview.workspaceParent').click());
  expect(props.actions.navigateElement).toHaveBeenLastCalledWith(parent);
  act(() => button('content.designReview.workspaceChildren').click());
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.map((item) => item.textContent)).toEqual(['button#save · Save changes', 'img']);
  act(() => options[1]!.click());
  expect(props.actions.navigateElement).toHaveBeenLastCalledWith(empty);
  props.state.treeNavigation = { parent: null, child: null };
  render(props);
  expect(button('content.designReview.workspaceParent').disabled).toBe(true);
  expect(button('content.designReview.workspaceChildren').disabled).toBe(true);
});
it.each(['inspect', 'move', 'compare'] as const)(
  'shows a selection prompt for empty %s and preserves inspector errors',
  (tool) => {
    const props = createProps();
    props.tool = tool;
    props.state.valueError = true;
    render(props);
    expect(host.textContent).toContain(translate('content.designReview.toolChooseElement'));
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(
      translate('content.designReview.workspaceValueError')
    );
    expect(host.querySelector('footer')).toBeNull();
  }
);
it('uses a disclosure for Measure hierarchy and renders its dedicated controls', () => {
  const props = createProps();
  props.tool = 'compare';
  selectElement(props);
  props.state.measure = { a: null, b: null, preview: null, slot: 'a', replacing: false };
  render(props);
  const tree = host.querySelector('details')!;
  expect(tree.open).toBe(false);
  act(() => {
    tree.open = true;
    tree.dispatchEvent(new Event('toggle', { bubbles: true }));
  });
  expect(tree.open).toBe(true);
  expect(host.querySelector('[data-measure-fields]')).not.toBeNull();
  props.tool = 'move';
  render(props);
  expect(host.querySelector('[data-measure-fields]')).toBeNull();
  expect(host.querySelector('[data-tool-fields="move"]')).not.toBeNull();
});
it('shows Check independently of the active tool and without hierarchy or element feedback', () => {
  const props = createProps();
  selectElement(props);
  props.checkOpen = true;
  props.checks = {
    scope: 'selected',
    setScope: vi.fn(),
    result: null,
    unavailable: false,
    navigationFailed: false,
    setNavigationFailed: vi.fn(),
    newScan: vi.fn(),
    recheck: vi.fn(),
    canScan: false,
    currentViewport: null,
    rootUnavailable: false,
    viewportChanged: false,
  };
  props.onFinding = vi.fn();
  render(props);
  expect(host.querySelector('aside')!.getAttribute('aria-label')).toBe(
    translate('content.designReview.checkTitle')
  );
  expect(host.querySelector('[data-ui="content.design-review.checks"]')).not.toBeNull();
  expect(host.querySelector('footer')).toBeNull();
  expect(
    host.querySelector('[aria-label="' + translate('content.designReview.workspaceParent') + '"]')
  ).toBeNull();
  expect(props.onFinding).not.toHaveBeenCalled();
});
