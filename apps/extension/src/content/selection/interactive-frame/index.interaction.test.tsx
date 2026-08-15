// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameData } from '../../../features/highlighter/contracts';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { InteractiveFrame } from '.';
import { queryAllContentUiElements, queryContentUiElement } from '../../platform/dom-host';
import { translate } from '../../../platform/i18n';
import { createCalloutSettingsFixture } from '../frame-runtime/test-support';
import {
  addCalloutDeleteListener,
  addCalloutPopoverSettingsChangedListener,
  addFrameCalloutChangedListener,
} from '../../platform/page-context/frame-events';
import { createDefaultFrameCallout } from '../../../features/highlighter/frame-annotation/defaults';
import { applyCalloutSettingsPatch } from '../../../features/highlighter/frame-annotation/callout/model';
import {
  getFrameCallout,
  removeFrameCallout,
  setFrameCallout,
} from '../../../features/highlighter/frame-annotation/callout/collection';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import type {
  PagePreparationHistoryBridge,
  PagePreparationSessionSnapshot,
} from '../../parser/page-preparation/history';

const highlighterMocks = vi.hoisted(() => ({
  clearFrameEditing: vi.fn(),
  isHighlighterEnabled: vi.fn(() => true),
  pauseHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
}));

vi.mock('../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlighter')>()),
  clearFrameEditing: highlighterMocks.clearFrameEditing,
  isHighlighterEnabled: highlighterMocks.isHighlighterEnabled,
  pauseHighlighter: highlighterMocks.pauseHighlighter,
  setFrameEditing: highlighterMocks.setFrameEditing,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let deferredFrameUpdates: FrameData[] = [];

function createFrame(): FrameData {
  return {
    id: 'frame-1',
    x: 120,
    y: 80,
    width: 320,
    height: 180,
    effectMode: 'border',
  };
}

function renderFrame(props?: Partial<React.ComponentProps<typeof InteractiveFrame>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const frame = createFrame();
  const onDelete = vi.fn();
  const onUpdate = vi.fn();

  act(() => {
    root?.render(
      <InteractiveFrame
        frame={frame}
        zIndex={10}
        onDelete={onDelete}
        onUpdate={onUpdate}
        {...props}
      />
    );
  });

  return { frame, onDelete, onUpdate };
}

function ControlledCalloutFrame() {
  const [frame, setFrame] = React.useState(createFrame);

  React.useEffect(
    () =>
      addFrameCalloutChangedListener(({ frameId, settings }) => {
        if (frameId !== frame.id) return;
        setFrame((current) => ({
          ...current,
          callout: applyCalloutSettingsPatch(
            current.callout ?? createDefaultFrameCallout(),
            settings
          ),
        }));
      }),
    [frame.id]
  );

  return <InteractiveFrame frame={frame} zIndex={10} onDelete={vi.fn()} onUpdate={setFrame} />;
}

function renderControlledCalloutFrame() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<ControlledCalloutFrame />));
}

function ControlledCalloutCollectionFrame(props: { initialAdditionalCount?: number }) {
  const [frame, setFrame] = React.useState<FrameData>(() => ({
    ...createFrame(),
    callout: createDefaultFrameCallout(),
    additionalCallouts: Array.from(
      { length: props.initialAdditionalCount ?? 0 },
      createDefaultFrameCallout
    ),
  }));

  React.useEffect(() => {
    const removeSettingsListener = addCalloutPopoverSettingsChangedListener(
      ({ calloutIndex = 0, frameId, settings }) => {
        if (frameId !== frame.id) return;
        setFrame((current) => {
          const callout = getFrameCallout(current, calloutIndex);
          return callout
            ? (setFrameCallout(
                current,
                calloutIndex,
                applyCalloutSettingsPatch(callout, settings)
              ) as FrameData)
            : current;
        });
      }
    );
    const removeDeleteListener = addCalloutDeleteListener(({ calloutIndex = 0, frameId }) => {
      if (frameId !== frame.id) return;
      setFrame((current) => removeFrameCallout(current, calloutIndex) as FrameData);
    });
    return () => {
      removeSettingsListener();
      removeDeleteListener();
    };
  }, [frame.id]);

  return <InteractiveFrame frame={frame} zIndex={10} onDelete={vi.fn()} onUpdate={setFrame} />;
}

function renderControlledCalloutCollectionFrame(initialAdditionalCount = 0) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ControlledCalloutCollectionFrame initialAdditionalCount={initialAdditionalCount} />
    )
  );
}

function DeferredCalloutCollectionFrame() {
  const [frame, setFrame] = React.useState<FrameData>(() => ({
    ...createFrame(),
    callout: createDefaultFrameCallout(),
  }));
  const acceptedAdditionalCountRef = React.useRef(0);
  const deferUpdate = React.useCallback((nextFrame: FrameData) => {
    deferredFrameUpdates.push(nextFrame);
    const nextAdditionalCount = nextFrame.additionalCallouts?.length ?? 0;
    if (nextAdditionalCount > acceptedAdditionalCountRef.current) {
      acceptedAdditionalCountRef.current = nextAdditionalCount;
      setFrame(nextFrame);
      return;
    }
    window.setTimeout(() => setFrame(nextFrame), 25);
  }, []);

  return <InteractiveFrame frame={frame} zIndex={10} onDelete={vi.fn()} onUpdate={deferUpdate} />;
}

function renderDeferredCalloutCollectionFrame() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<DeferredCalloutCollectionFrame />));
}

function enterActiveCalloutText(value: string) {
  const editable = queryAllContentUiElements<HTMLElement>('[contenteditable="true"]')[0];
  expect(editable).toBeInstanceOf(HTMLElement);
  expect((editable?.getRootNode() as ShadowRoot).activeElement).toBe(editable);
  act(() => {
    if (!editable) return;
    editable.textContent = value;
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    editable.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
    );
  });
}

function findToolbarButton(titlePattern: RegExp | string): HTMLButtonElement {
  const button = queryAllContentUiElements('button').find(
    (item): item is HTMLButtonElement =>
      item instanceof HTMLButtonElement &&
      (typeof titlePattern === 'string'
        ? item.title.includes(titlePattern)
        : titlePattern.test(item.title))
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function createHistorySnapshot(): PagePreparationSessionSnapshot {
  return {
    annotations: {
      domRecords: [],
      frameOrders: [],
      nextAnnotationId: 1,
      nextCreationOrder: 1,
      nextMarkerNumber: 1,
      schemaVersion: 1,
    },
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [],
    },
  };
}

function openFrameSizeEditor() {
  act(() => {
    useFrameUIStore.getState().selectFrame('frame-1');
  });

  act(() => {
    findToolbarButton(/Edit|Редактировать/).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });

  const frameContainer = document.querySelector<HTMLDivElement>('.sniptale-frame-container');
  const widthInput = document.querySelector<HTMLInputElement>(
    '.sniptale-content-size-tooltip-input'
  );

  expect(frameContainer).toBeInstanceOf(HTMLDivElement);
  expect(widthInput).toBeInstanceOf(HTMLInputElement);
  return {
    frameContainer: frameContainer as HTMLDivElement,
    widthInput: widthInput as HTMLInputElement,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useFrameUIStore.getState().reset();
  pagePreparationHistory.clear();
  deferredFrameUpdates = [];
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  useFrameUIStore.getState().reset();
  pagePreparationHistory.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('InteractiveFrame size edit interactions', () => {
  it('shows only the compact trigger on hover and the full toolbar after selection', () => {
    const { frame } = renderFrame();

    act(() => useFrameUIStore.getState().hoverFrame(frame.id));
    const trigger = queryContentUiElement('.sniptale-frame-toolbar-trigger');
    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeNull();

    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    expect(queryContentUiElement('.sniptale-frame-toolbar-trigger')).toBeNull();
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeInstanceOf(HTMLElement);
  });

  it('applies one five-pixel expansion from the selected toolbar', () => {
    const { frame, onUpdate } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Increase frame size|Увеличить рамку/).click();
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ x: 115, y: 75, width: 330, height: 190 })
    );
  });
});

describe('InteractiveFrame callout collection interactions', () => {
  it('adds a fifth visible comment through the real mini-button pointer sequence', async () => {
    renderControlledCalloutCollectionFrame(3);
    act(() => useFrameUIStore.getState().hoverFrame('frame-1'));

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(4);
    const miniAction = queryContentUiElement<HTMLButtonElement>(
      '[data-quick-action="add-callout"]'
    );
    expect(miniAction).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      if (!miniAction) return;
      miniAction.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
      );
      miniAction.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })
      );
      miniAction.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0, cancelable: true })
      );
      miniAction.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, button: 0, cancelable: true })
      );
      miniAction.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      );
      await Promise.resolve();
    });

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(5);
    expect(queryAllContentUiElements('[contenteditable="true"]')).toHaveLength(1);
    expect(queryContentUiElement('[data-quick-action="add-callout"]')).toBeNull();
  });

  it('renders and immediately edits an additional callout from the selected toolbar', () => {
    const frame = { ...createFrame(), callout: createCalloutSettingsFixture() };
    const { onUpdate } = renderFrame({ frame });
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Add another comment|Добавить ещё один комментарий/).click();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ additionalCallouts: [expect.objectContaining({ enabled: true })] })
    );
    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(2);
    const editable = queryAllContentUiElements('[contenteditable="true"]');
    expect(editable).toHaveLength(1);
    expect((editable[0]?.getRootNode() as ShadowRoot).activeElement).toBe(editable[0]);
  });

  it('focuses a primary comment enabled from the quick action and removes it when left empty', () => {
    renderControlledCalloutFrame();
    act(() => useFrameUIStore.getState().hoverFrame('frame-1'));

    act(() => {
      findToolbarButton(/Add comment|Добавить комментарий/).click();
    });

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(1);
    const editable = queryAllContentUiElements<HTMLElement>('[contenteditable="true"]')[0];
    expect(editable).toBeInstanceOf(HTMLElement);
    expect((editable?.getRootNode() as ShadowRoot).activeElement).toBe(editable);

    act(() => editable?.blur());

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(0);
  });

  it('re-adds and focuses a primary comment after outside-click discards an empty draft', () => {
    const snapshot = createHistorySnapshot();
    const historyBridge: PagePreparationHistoryBridge = {
      applySnapshot: vi.fn(),
      captureSnapshot: () => snapshot,
    };
    pagePreparationHistory.registerBridge(historyBridge);
    renderControlledCalloutFrame();
    act(() => useFrameUIStore.getState().hoverFrame('frame-1'));

    act(() => {
      findToolbarButton(/Add comment|Добавить комментарий/).click();
    });
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(true);

    const blockingOverlay = queryContentUiElement<HTMLElement>('.sniptale-blocking-overlay');
    expect(blockingOverlay).toBeInstanceOf(HTMLElement);
    act(() => {
      blockingOverlay?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
      );
    });

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(0);
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);

    act(() => useFrameUIStore.getState().hoverFrame('frame-1'));
    act(() => {
      findToolbarButton(/Add comment|Добавить комментарий/).click();
    });

    const editable = queryAllContentUiElements<HTMLElement>('[contenteditable="true"]')[0];
    expect(editable).toBeInstanceOf(HTMLElement);
    expect((editable?.getRootNode() as ShadowRoot).activeElement).toBe(editable);
    act(() => editable?.blur());
    expect(pagePreparationHistory.hasOpenTransactions()).toBe(false);
    pagePreparationHistory.unregisterBridge(historyBridge);
  });

  it('adds four independent comments and disables only the selected additional comment', () => {
    renderControlledCalloutCollectionFrame();

    for (let index = 1; index <= 4; index += 1) {
      act(() => useFrameUIStore.getState().selectFrame('frame-1'));
      act(() => {
        findToolbarButton(/Add another comment|Добавить ещё один комментарий/).click();
      });
      enterActiveCalloutText(`Comment ${index}`);
    }

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(5);
    expect(
      queryAllContentUiElements('.sniptale-callout').map((callout) => callout.textContent)
    ).toEqual(expect.arrayContaining(['Comment 1', 'Comment 2', 'Comment 3', 'Comment 4']));

    const settingsHandles = queryAllContentUiElements<HTMLElement>(
      '.sniptale-callout-settings-handle'
    );
    act(() => settingsHandles.at(-1)?.click());
    act(() => {
      findToolbarButton(translate('content.callout.disableButton')).click();
    });

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(4);
    expect(
      queryAllContentUiElements('.sniptale-callout').some((callout) =>
        callout.textContent?.includes('Comment 4')
      )
    ).toBe(false);
  });

  it('keeps staged text and permits the next comment before the frame owner acknowledges updates', () => {
    vi.useFakeTimers();
    renderDeferredCalloutCollectionFrame();

    act(() => useFrameUIStore.getState().selectFrame('frame-1'));
    act(() => {
      findToolbarButton(/Add another comment|Добавить ещё один комментарий/).click();
    });
    enterActiveCalloutText('Second comment');

    expect(deferredFrameUpdates.at(-1)?.additionalCallouts?.[0]?.content.bodyHtml).toContain(
      'Second comment'
    );

    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(2);
    expect(
      queryAllContentUiElements('.sniptale-callout').map((callout) => callout.textContent ?? '')
    ).toEqual(expect.arrayContaining([expect.stringContaining('Second comment')]));

    act(() => useFrameUIStore.getState().selectFrame('frame-1'));
    act(() => {
      findToolbarButton(/Add another comment|Добавить ещё один комментарий/).click();
    });
    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(3);
    expect(queryAllContentUiElements('[contenteditable="true"]')).toHaveLength(1);
    enterActiveCalloutText('Third comment');

    act(() => useFrameUIStore.getState().selectFrame('frame-1'));
    act(() => {
      findToolbarButton(/Add another comment|Добавить ещё один комментарий/).click();
    });
    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(4);
    expect(queryAllContentUiElements('[contenteditable="true"]')).toHaveLength(1);

    act(() => vi.runAllTimers());
    expect(queryAllContentUiElements('.sniptale-callout')).toHaveLength(4);
    vi.useRealTimers();
  });
});

describe('InteractiveFrame toolbar and size interactions', () => {
  it('separates numbering from the remaining toolbar command groups', () => {
    const { frame } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    const toolbar = queryContentUiElement<HTMLElement>('.sniptale-action-toolbar');
    const titles = Array.from(toolbar?.querySelectorAll<HTMLButtonElement>('button') ?? []).map(
      (button) => button.title
    );

    expect(titles).toEqual([
      translate('content.interactiveFrame.effectBorder'),
      translate('content.interactiveFrame.stepBadgeEnable'),
      translate('content.interactiveFrame.calloutAdd'),
      translate('content.interactiveFrame.decreaseFrame'),
      translate('content.interactiveFrame.increaseFrame'),
      translate('content.interactiveFrame.editButton'),
      translate('content.interactiveFrame.hideDuringCapture'),
      translate('content.interactiveFrame.deleteButton'),
      translate('content.interactiveFrame.closeToolbar'),
    ]);
    expect(toolbar?.querySelectorAll('.sniptale-glass-toolbar-divider')).toHaveLength(5);
    expect(
      [
        ...(toolbar?.querySelectorAll<HTMLButtonElement>('[data-menu-indicator="true"]') ?? []),
      ].every((button) => button.dataset['sniptaleActivationBridge'] === 'defer')
    ).toBe(true);
  });

  it('closes the selected toolbar without deleting the frame', () => {
    const { frame, onDelete } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Close|Закрыть/).click();
    });

    expect(useFrameUIStore.getState().selectedFrameId).toBeNull();
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('keeps the selected toolbar fixed when its settings popover opens', () => {
    const { frame } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));
    const toolbar = queryContentUiElement<HTMLElement>('.sniptale-toolbar-portal-wrapper');
    expect(toolbar).toBeInstanceOf(HTMLElement);
    const before = {
      left: toolbar?.style.left,
      side: toolbar?.dataset['placementSide'],
      top: toolbar?.style.top,
    };

    act(() => {
      findToolbarButton(/Border|Рамка/).click();
    });

    expect(queryContentUiElement('.sniptale-frame-settings-popover')).toBeInstanceOf(HTMLElement);
    expect({
      left: toolbar?.style.left,
      side: toolbar?.dataset['placementSide'],
      top: toolbar?.style.top,
    }).toEqual(before);
  });

  it('switches the frame effect from the shared settings menu without closing it', () => {
    const { frame, onUpdate } = renderFrame();
    act(() => useFrameUIStore.getState().selectFrame(frame.id));

    act(() => {
      findToolbarButton(/Border|Рамка/).click();
    });

    expect(useFrameUIStore.getState().activePopover).toEqual({
      frameId: frame.id,
      kind: 'frame-settings',
    });
    expect(queryContentUiElement('.sniptale-frame-settings-popover')).toBeInstanceOf(HTMLElement);

    act(() => {
      findToolbarButton(/Blur|Размытие/).click();
    });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ effectMode: 'blur' }));
    expect(queryContentUiElement('.sniptale-frame-settings-popover')).toBeInstanceOf(HTMLElement);
  });

  it('keeps the highlighter frame visible when the width input is cleared', () => {
    const { onDelete } = renderFrame();
    const { frameContainer, widthInput } = openFrameSizeEditor();

    expect(frameContainer.style.width).toBe('320px');
    expect(frameContainer.style.height).toBe('180px');

    act(() => {
      widthInput.focus();
      widthInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' })
      );
      setInputValue(widthInput, '');
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(document.querySelector('.sniptale-frame-container')).toBe(frameContainer);
    expect(frameContainer.style.width).toBe('320px');
    expect(frameContainer.style.height).toBe('180px');

    act(() => {
      widthInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(widthInput.value).toBe('320');
    expect(frameContainer.style.width).toBe('320px');
  });

  it('returns the selected toolbar after Escape cancels size editing', () => {
    const { frame } = renderFrame();
    openFrameSizeEditor();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(document.querySelector('.sniptale-content-size-tooltip')).toBeNull();
    expect(useFrameUIStore.getState().selectedFrameId).toBe(frame.id);
    expect(queryContentUiElement('.sniptale-action-toolbar')).toBeInstanceOf(HTMLElement);
  });

  it('applies the width input draft when Enter is pressed', () => {
    renderFrame();
    const { frameContainer, widthInput } = openFrameSizeEditor();

    act(() => {
      widthInput.focus();
      setInputValue(widthInput, '450');
      widthInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
      );
    });

    expect(widthInput.value).toBe('450');
    expect(frameContainer.style.width).toBe('450px');
  });

  it('routes a bubbling pointer interaction from the portaled size toolbar after Edit', () => {
    renderFrame();
    const { frameContainer } = openFrameSizeEditor();
    const portal = document.querySelector<HTMLElement>('#sniptale-frame-size-panel-portal');
    const increaseWidth = portal?.querySelector<HTMLButtonElement>('.sniptale-size-btn-plus');
    const pointerDown = vi.fn();

    expect(portal).toBeInstanceOf(HTMLElement);
    expect(increaseWidth).toBeInstanceOf(HTMLButtonElement);
    portal?.addEventListener('pointerdown', pointerDown);

    act(() => {
      increaseWidth?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, cancelable: true })
      );
      increaseWidth?.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })
      );
      increaseWidth?.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, button: 0, cancelable: true })
      );
      increaseWidth?.click();
    });

    expect(pointerDown).toHaveBeenCalledOnce();
    expect(frameContainer.style.width).toBe('330px');
  });
});
