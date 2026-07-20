// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import {
  panelButtonClassName,
  primaryPanelButtonClassName,
  renderDefaultToolInspector,
  renderLayerSizeInputs,
  secondaryPanelButtonClassName,
  selectSharedToolProps,
} from './helpers';
import {
  CollapsibleSection,
  HeaderValueToggleSection,
  PanelSection,
  renderSelectionActionsSectionWithController,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function MockLabeledRow(props: { label: string; children: React.ReactNode }) {
  return <div>{props.children}</div>;
}

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('reuses the shared panel shell and omits legacy selection actions', async () => {
  await renderUi(
    <>
      <PanelSection label="Selection" value="Arrow">
        <div>section-body</div>
      </PanelSection>
      {renderSelectionActionsSectionWithController(
        {
          canDeleteSelection: true,
          panelButtonClassName: 'panel-button',
          selection: {
            hasSelection: true,
            selectedObjectType: 'arrow',
          } as never,
          selectionDeleteIcon: <span>delete</span>,
          selectionDuplicateIcon: <span>duplicate</span>,
        },
        { deleteSelection: vi.fn(), duplicateSelection: vi.fn() }
      )}
    </>
  );

  expect(container?.textContent).toContain('section-body');
  expect(container?.textContent).not.toContain(translate('editor.compact.selection'));
  expect(container?.querySelectorAll('button')).toHaveLength(0);
});

it('hides duplicate panel headers for compact row children', async () => {
  await renderUi(
    <PanelSection label="Style" value="Solid">
      <MockLabeledRow label="Style">Style row</MockLabeledRow>
    </PanelSection>
  );

  expect(container?.textContent?.match(/Style/g)).toHaveLength(1);
  expect(container?.textContent).not.toContain('Solid');
  expect(container?.textContent).toContain('Style row');
});

it('returns null for every legacy selection-action branch', async () => {
  await renderUi(
    <>
      {renderSelectionActionsSectionWithController(
        {
          canDeleteSelection: false,
          panelButtonClassName: 'panel-button',
          selection: {
            hasSelection: true,
            selectedObjectType: null,
          } as never,
          selectionDeleteIcon: <span>delete</span>,
          selectionDuplicateIcon: <span>duplicate</span>,
        },
        { deleteSelection: vi.fn(), duplicateSelection: vi.fn() }
      )}
      {renderSelectionActionsSectionWithController(
        {
          canDeleteSelection: true,
          panelButtonClassName: 'panel-button',
          selection: {
            hasSelection: false,
            selectedObjectType: null,
          } as never,
          selectionDeleteIcon: <span>delete</span>,
          selectionDuplicateIcon: <span>duplicate</span>,
        },
        { deleteSelection: vi.fn(), duplicateSelection: vi.fn() }
      )}
    </>
  );

  expect(container?.textContent).toBe('');
  expect(container?.querySelectorAll('button')).toHaveLength(0);
});

it('reuses inspector chrome button classes for tool panels', () => {
  expect(panelButtonClassName).toContain('rounded-[12px]');
  expect(panelButtonClassName).toContain('border-none');
  expect(primaryPanelButtonClassName).toContain('text-[12px] font-medium');
  expect(secondaryPanelButtonClassName).toContain(
    'hover:text-[color:var(--sniptale-color-text-primary)]'
  );
});

it('renders shared collapsible and header-value toggle sections accessibly', async () => {
  const onToggle = vi.fn();

  await renderUi(
    <>
      <CollapsibleSection label="Line">
        <div>line-body</div>
      </CollapsibleSection>
      <HeaderValueToggleSection active label="Dynamic" value="On" onToggle={onToggle} />
    </>
  );

  const buttons = container?.querySelectorAll('button');
  expect(buttons?.[0]?.getAttribute('aria-expanded')).toBe('true');
  expect(container?.textContent).toContain('line-body');

  await act(async () => {
    buttons?.[0]?.click();
    buttons?.[1]?.click();
  });

  expect(container?.textContent).not.toContain('line-body');
  expect(onToggle).toHaveBeenCalledOnce();
  expect(buttons?.[1]?.getAttribute('aria-pressed')).toBe('true');
});

it('covers helper-driven fallbacks for tool panels', async () => {
  const setLayerSizeDraft = vi.fn();

  await renderUi(
    <>
      {renderLayerSizeInputs({
        layerAspectRatio: 2,
        layerSizeDraft: { width: 120, height: 60 },
        layerSizeLocked: true,
        setLayerSizeDraft,
      })}
      {renderDefaultToolInspector()}
    </>
  );

  expect(container?.textContent).toContain(translate('editor.compact.chooseToolOrObject'));
  expect(container?.querySelectorAll('input')).toHaveLength(2);
  expect(
    selectSharedToolProps({
      inspectorToolSettings: {} as never,
      previewColor: vi.fn(),
      recentColors: ['#fff'],
      toNumber: vi.fn(),
      updateColor: vi.fn(),
    })
  ).toEqual(
    expect.objectContaining({
      inspectorToolSettings: {},
      recentColors: ['#fff'],
    })
  );
  expect(setLayerSizeDraft).not.toHaveBeenCalled();
});
