// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selectMocks = vi.hoisted(() => ({ plain: vi.fn(), field: vi.fn() }));

vi.mock('../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/compact-inspector-controls')>()),
  CompactSelect: (props: {
    disabled?: boolean;
    onChange: (value: string) => void;
    options: readonly { value: string }[];
  }) => {
    selectMocks.plain(props);
    return (
      <button disabled={props.disabled} onClick={() => props.onChange(props.options[1]!.value)}>
        Select mode
      </button>
    );
  },
  SelectField: (props: {
    disabled?: boolean;
    label: string;
    onChange: (value: string) => void;
    options: readonly { value: string }[];
  }) => {
    selectMocks.field(props);
    return (
      <button disabled={props.disabled} onClick={() => props.onChange(props.options[1]!.value)}>
        {props.label}
      </button>
    );
  },
}));

import {
  EDITOR_INSPECTOR_GROUP_META_CLASS_NAME,
  EditorInspectorDetails,
  EditorInspectorGroupSection,
  EditorInspectorSelectInput,
} from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

describe('grouped inspector exports', () => {
  it('persists an uncontrolled disclosure toggle in local state', () => {
    render(
      <EditorInspectorDetails preferenceId="local-group" label="Effects" initiallyOpen>
        <button>Effect control</button>
      </EditorInspectorDetails>
    );

    const disclosure = container!.querySelector('details')!;
    expect(disclosure.open).toBe(true);
    act(() => {
      disclosure.open = false;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    expect(disclosure.open).toBe(false);
    render(
      <EditorInspectorDetails preferenceId="local-group" label="Effects" initiallyOpen>
        <button>Updated effect control</button>
      </EditorInspectorDetails>
    );
    expect(container!.querySelector('details')?.open).toBe(false);
  });

  it('routes controlled disclosure changes to its owner', () => {
    const onToggle = vi.fn();
    render(
      <EditorInspectorDetails
        preferenceId="controlled-group"
        label="Workspace"
        level="section"
        open={false}
        onToggle={onToggle}
      >
        Workspace controls
      </EditorInspectorDetails>
    );

    const disclosure = container!.querySelector('details')!;
    act(() => {
      disclosure.open = true;
      disclosure.dispatchEvent(new Event('toggle'));
    });
    expect(onToggle).toHaveBeenCalledWith(true);
    render(
      <EditorInspectorDetails
        preferenceId="controlled-group"
        label="Workspace"
        level="section"
        open={true}
        onToggle={onToggle}
      >
        Workspace controls
      </EditorInspectorDetails>
    );
    expect(container!.querySelector('details')?.open).toBe(true);
  });

  it('routes both select variants through the wrapping menu and change callback', () => {
    const onChange = vi.fn();
    const options = [
      { label: 'Fit', value: 'fit' },
      { label: 'Fill', value: 'fill' },
    ] as const;
    render(
      <>
        <EditorInspectorSelectInput
          ariaLabel="Canvas mode"
          value="fit"
          options={options}
          onChange={onChange}
        />
        <EditorInspectorSelectInput
          label="Content mode"
          value="fit"
          options={options}
          onChange={onChange}
          disabled
        />
      </>
    );

    const plain = selectMocks.plain.mock.lastCall?.[0];
    const field = selectMocks.field.mock.lastCall?.[0];
    expect(plain).toMatchObject({
      appearance: 'plain',
      'aria-label': 'Canvas mode',
      menuClassName: 'editor-inspector-select-menu',
      value: 'fit',
    });
    expect(field).toMatchObject({
      disabled: true,
      label: 'Content mode',
      menuClassName: 'editor-inspector-select-menu',
      value: 'fit',
    });
    expect(field.onChange).toBe(onChange);
    act(() => (container!.querySelector('button') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith('fill');
  });

  it('renders group labels, metadata, and content as one section', () => {
    render(
      <EditorInspectorGroupSection label="Size" meta="1280 × 720">
        <button>Apply size</button>
      </EditorInspectorGroupSection>
    );

    const section = container!.querySelector('section')!;
    expect(section.textContent).toContain('Size');
    expect(section.textContent).toContain('1280 × 720');
    expect(section.querySelector('button')?.textContent).toBe('Apply size');
    expect(section.querySelector('p')?.className).toBe(EDITOR_INSPECTOR_GROUP_META_CLASS_NAME);
  });
});

it('retains available selection when a named field becomes disabled and enabled again', () => {
  const onChange = vi.fn();
  const options = [
    { label: 'Fit', value: 'fit' },
    { label: 'Fill', value: 'fill' },
  ] as const;
  render(
    <EditorInspectorSelectInput
      label="Placement"
      value="fit"
      options={options}
      onChange={onChange}
    />
  );
  act(() => container!.querySelector('button')!.click());
  expect(onChange).toHaveBeenLastCalledWith('fill');
  render(
    <EditorInspectorSelectInput
      label="Placement"
      value="fill"
      options={options}
      onChange={onChange}
      disabled
    />
  );
  expect(container!.querySelector('button')!.disabled).toBe(true);
  act(() => container!.querySelector('button')!.click());
  expect(onChange).toHaveBeenCalledTimes(1);
  render(
    <EditorInspectorSelectInput
      value="fill"
      options={options}
      onChange={onChange}
      disabled={false}
    />
  );
  expect(selectMocks.plain.mock.lastCall?.[0]).toMatchObject({
    'aria-label': '',
    value: 'fill',
    disabled: false,
  });
  expect(container!.querySelector('button')!.disabled).toBe(false);
});

it('keeps optional group headers out of unnamed content and supports independent metadata', () => {
  render(
    <EditorInspectorGroupSection>
      <button>Apply</button>
    </EditorInspectorGroupSection>
  );
  expect(container!.querySelector('section')!.children).toHaveLength(1);
  expect(container!.querySelector('button')!.textContent).toBe('Apply');
  render(
    <EditorInspectorGroupSection meta="1280 × 720">
      <button>Apply</button>
    </EditorInspectorGroupSection>
  );
  expect(container!.querySelector('section')!.textContent).toContain('1280 × 720');
  expect(container!.querySelector('p')).toBeNull();
  render(
    <EditorInspectorGroupSection label="Dimensions">
      <button>Apply</button>
    </EditorInspectorGroupSection>
  );
  expect(container!.querySelector('p')!.textContent).toBe('Dimensions');
  expect(container!.querySelector('section')!.textContent).not.toContain('1280 × 720');
});
