// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InspectorGroupedPanel,
  InspectorGroupHeaderSlotContext,
  InspectorGroupSection,
  InspectorGroupSwitch,
  useInspectorGroups,
} from './index';
import type { InspectorGroupHeaderSlot } from './index';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('grouped-inspector visibility', () => {
  it('hides the switch when only one group remains visible', () => {
    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'general', label: 'General', content: 'General content' },
            { id: 'style', label: 'Style', content: 'Style content', visible: false },
          ]}
        />
      );
    });

    expect(container?.querySelectorAll('button')).toHaveLength(0);
    expect(container?.textContent).toContain('General content');
  });

  it('resets the active group when the current group disappears after rerender', () => {
    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'general', label: 'General', content: 'General content' },
            { id: 'target', label: 'Target', content: 'Target content' },
          ]}
        />
      );
    });

    const targetButton = container?.querySelectorAll<HTMLButtonElement>('button')[1];
    act(() => {
      targetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container?.textContent).toContain('Target content');

    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'general', label: 'General', content: 'General content' },
            { id: 'target', label: 'Target', content: 'Target content', visible: false },
          ]}
        />
      );
    });

    expect(container?.textContent).toContain('General content');
    expect(container?.textContent).not.toContain('Target content');
  });
});

describe('grouped-inspector switch', () => {
  it('prefers the first visible defaultActive group over read-only info', () => {
    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'info', label: 'Info', content: 'Info content' },
            { id: 'general', label: 'General', content: 'General content', defaultActive: true },
            { id: 'target', label: 'Target', content: 'Target content' },
          ]}
        />
      );
    });

    expect(container?.textContent).toContain('General content');
    expect(container?.textContent).not.toContain('Info content');
  });

  it('uses the first editable group when no explicit default is provided', () => {
    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'info', label: 'Info', content: 'Info content' },
            { id: 'target', label: 'Target', content: 'Target content' },
          ]}
        />
      );
    });

    expect(container?.textContent).toContain('Target content');
    expect(container?.textContent).not.toContain('Info content');
  });
});

describe('grouped-inspector switch visuals', () => {
  it('wraps groups while preserving the active selection and activation', () => {
    act(() => {
      root?.render(
        <TestHarness
          groups={[
            { id: 'info', label: 'Info', content: 'Info content' },
            { id: 'general', label: 'General', content: 'General content', defaultActive: true },
            { id: 'target', label: 'Target', content: 'Target content' },
            { id: 'style', label: 'Style', content: 'Style content' },
          ]}
        />
      );
    });

    const switchNode = container?.querySelector<HTMLElement>('[role="group"]');
    const activeButton = switchNode?.querySelector<HTMLButtonElement>(
      'button[aria-pressed="true"]'
    );

    expect(switchNode?.className).toContain('flex-wrap');
    expect(activeButton?.textContent).toBe('General');
    const targetButton = Array.from(switchNode?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'Target'
    );
    act(() => targetButton?.click());
    expect(targetButton?.getAttribute('aria-pressed')).toBe('true');
    expect(container?.textContent).toContain('Target content');
    expect(container?.textContent).not.toContain('General content');
  });

  it('does not duplicate the active group label inside the body', () => {
    act(() => {
      root?.render(
        <div>
          <InspectorGroupSection>General content</InspectorGroupSection>
        </div>
      );
    });

    expect(container?.textContent).toBe('General content');
  });
});

describe('grouped-inspector header slot', () => {
  it('registers a stable header slot without re-rendering the parent repeatedly', () => {
    const onRender = vi.fn();

    act(() => {
      root?.render(<HeaderSlotHarness onRender={onRender} />);
    });

    expect(container?.textContent).toContain('General content');
    expect(container?.textContent).toContain('general');
    expect(onRender).toHaveBeenCalledTimes(2);
  });
});

function TestHarness(props: {
  groups: Array<{
    content: string;
    defaultActive?: boolean;
    id: 'general' | 'info' | 'target' | 'style';
    label: string;
    visible?: boolean;
  }>;
}) {
  const { activeGroup, setActiveGroupId, visibleGroups } = useInspectorGroups(props.groups);

  if (!activeGroup) {
    return null;
  }

  return (
    <div>
      <InspectorGroupSwitch
        ariaLabel="Groups"
        activeGroupId={activeGroup.id}
        groups={visibleGroups}
        onChange={setActiveGroupId}
      />
      <InspectorGroupSection label={activeGroup.label}>{activeGroup.content}</InspectorGroupSection>
    </div>
  );
}

function HeaderSlotHarness({ onRender }: { onRender: () => void }) {
  const [slot, setSlot] = useState<InspectorGroupHeaderSlot | null>(null);

  onRender();

  return (
    <InspectorGroupHeaderSlotContext.Provider value={setSlot}>
      <InspectorGroupedPanel
        groups={[
          { id: 'info', label: 'Info', content: 'Info content' },
          { id: 'general', label: 'General', content: 'General content', defaultActive: true },
          { id: 'style', label: 'Style', content: 'Style content' },
        ]}
      />
      <output>{slot?.activeGroupId ?? 'none'}</output>
    </InspectorGroupHeaderSlotContext.Provider>
  );
}
