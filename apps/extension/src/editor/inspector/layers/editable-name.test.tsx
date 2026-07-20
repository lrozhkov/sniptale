// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const renameLayerMock = vi.hoisted(() => vi.fn());
const compactInputMock = vi.hoisted(() =>
  vi.fn<(props: Record<string, unknown>) => null>(() => null)
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal()),
  useEditorController: () => ({
    renameLayer: renameLayerMock,
  }),
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  CompactInput: compactInputMock,
}));

import { LayerName, useEditableLayerName } from './editable-name';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const LAYER = {
  effectCount: 2,
  effects: [],
  id: 'layer-1',
  locked: false,
  name: 'Layer 1',
  previewColor: '#ffffff',
  previewDataUrl: null,
  previewTransparent: false,
  raster: false,
  selected: false,
  selectedCount: 1,
  type: 'rectangle',
  typeLabel: 'Rectangle',
  visible: true,
} as const;

function renderEditableName() {
  const Harness = () => {
    const editableName = useEditableLayerName(LAYER as never);
    return (
      <div>
        <button type="button" onClick={editableName.startEditing}>
          start
        </button>
        <button type="button" onClick={() => editableName.setDraftName('Renamed Layer')}>
          rename
        </button>
        <button type="button" onClick={editableName.commit}>
          commit
        </button>
        <button type="button" onClick={editableName.cancel}>
          cancel
        </button>
        <LayerName editableName={editableName} layer={LAYER as never} />
      </div>
    );
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  compactInputMock.mockClear();
  renameLayerMock.mockReset();
});

it('starts editing on double click and commits a renamed layer on blur', () => {
  renderEditableName();

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'start')
      ?.click();
  });

  const initialInputProps = compactInputMock.mock.calls.at(-1)?.[0] as
    | {
        onBlur?: () => void;
        onChange?: (event: { currentTarget: { value: string } }) => void;
      }
    | undefined;

  act(() => {
    initialInputProps?.onChange?.({ currentTarget: { value: 'Renamed Layer' } });
  });
  const committedInputProps = compactInputMock.mock.calls.at(-1)?.[0] as
    | {
        onBlur?: () => void;
      }
    | undefined;
  act(() => {
    committedInputProps?.onBlur?.();
  });

  expect(renameLayerMock).toHaveBeenCalledWith('layer-1', 'Renamed Layer');
});

it('shows the secondary type/effect summary and cancels rename on escape', () => {
  renderEditableName();

  expect(container?.textContent).toContain('Rectangle');
  expect(container?.textContent).toContain('2 editor.toolbar.layerEffectsAppliedShort');
  const secondary = Array.from(container?.querySelectorAll('span') ?? []).find((element) =>
    element.className.includes('text-[10px]')
  );
  expect(secondary?.className).toContain('font-semibold uppercase');
  expect(secondary?.className).not.toContain('tracking-');

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'start')
      ?.click();
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'cancel')
      ?.click();
  });

  expect(renameLayerMock).not.toHaveBeenCalled();
  expect(container?.textContent).toContain('Layer 1');
});

it('skips rename commits for blank or unchanged names and starts editing from the name metadata block', () => {
  renderEditableName();

  act(() => {
    const label = Array.from(container?.querySelectorAll('span') ?? []).find((element) =>
      element.textContent?.includes('Rectangle')
    );
    label?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });

  const inputProps = compactInputMock.mock.calls.at(-1)?.[0] as
    | {
        onBlur?: () => void;
        onChange?: (event: { currentTarget: { value: string } }) => void;
        onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
      }
    | undefined;

  act(() => {
    inputProps?.onChange?.({ currentTarget: { value: '   ' } });
    inputProps?.onKeyDown?.({ key: 'Enter', preventDefault: vi.fn() });
  });

  expect(renameLayerMock).not.toHaveBeenCalled();

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'start')
      ?.click();
  });

  const unchangedInputProps = compactInputMock.mock.calls.at(-1)?.[0] as
    | {
        onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
      }
    | undefined;

  act(() => {
    unchangedInputProps?.onKeyDown?.({ key: 'Escape', preventDefault: vi.fn() });
  });

  expect(renameLayerMock).not.toHaveBeenCalled();
});
