import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import {
  CollapsibleSection,
  ColorField,
  EmptyState,
  FileActionRow,
  InspectorPanel,
  MiniScrubber,
  NumericRow,
  OptionRow,
  PanelSection,
  PresetGroup,
  PresetList,
  SearchField,
  SegmentedRow,
  SelectField,
  StatusRow,
  TextareaField,
  TextField,
  ToggleGrid,
  type CollapsibleSectionProps,
  type InspectorPanelProps,
  type MiniScrubberProps,
  type NumericRowProps,
  type PanelSectionProps,
} from './index';

it('renders compact inspector layout, controls, and empty list states', () => {
  const markup = [
    renderPanelShellMarkup(),
    renderFieldControlMarkup(),
    renderChoiceControlMarkup(),
    renderPresetAndStateMarkup(),
  ].join('');

  assertPanelShellMarkup(markup);
  assertFieldControlMarkup(markup);
  assertChoiceControlMarkup(markup);
  assertPresetAndStateMarkup(markup);
});

function renderPanelShellMarkup() {
  const inspectorProps: InspectorPanelProps = { children: 'Panel shell', className: 'custom' };
  const sectionProps: PanelSectionProps = { children: 'Body', label: 'Line', value: '4px' };
  const collapsibleProps: CollapsibleSectionProps = {
    children: 'Hidden section',
    defaultOpen: false,
    label: 'Shadow',
    value: 'Off',
  };

  return renderToStaticMarkup(
    <InspectorPanel {...inspectorProps}>
      <PanelSection {...sectionProps} />
      <PanelSection label="No value" />
      <CollapsibleSection {...collapsibleProps} />
      <CollapsibleSection label="Open" open onOpenChange={() => undefined}>
        Open body
      </CollapsibleSection>
      <CollapsibleSection label="Default open">Default body</CollapsibleSection>
    </InspectorPanel>
  );
}

function renderFieldControlMarkup() {
  const numericProps: NumericRowProps = {
    label: 'Opacity',
    max: 100,
    min: 0,
    onCommitValue: () => undefined,
    onPreviewValue: () => undefined,
    scrub: { max: 100, min: 0, step: 1 },
    unit: '%',
    value: 70,
  };
  const scrubberProps: MiniScrubberProps = { max: 100, min: 0, unit: '%', value: 42 };

  return renderToStaticMarkup(
    <>
      <NumericRow {...numericProps} />
      <MiniScrubber {...scrubberProps} />
      <MiniScrubber {...scrubberProps} active />
      <ColorField
        label="Line color"
        title="Line color"
        value="#112233"
        onChange={() => undefined}
      />
      <SelectField
        label="Style"
        value="solid"
        onChange={() => undefined}
        options={[{ value: 'solid', label: 'Solid' }]}
      />
      <TextField label="Title" value="Scene" readOnly />
      <TextareaField label="Notes" value="Longer copy" onChange={() => undefined} />
    </>
  );
}

function renderChoiceControlMarkup() {
  return renderToStaticMarkup(
    <>
      {renderSegmentedRows()}
      <ToggleGrid
        ariaLabel="Typography"
        options={[
          { label: 'Bold', active: true, onToggle: () => undefined },
          { label: 'Italic', active: false, onToggle: () => undefined },
        ]}
      />
      <OptionRow active label="Smoothing" value="On" onToggle={() => undefined} />
      <OptionRow disabled label="Dynamic width" value="Off" />
    </>
  );
}

function renderSegmentedRows() {
  return (
    <>
      <SegmentedRow
        ariaLabel="Mode 2"
        columns={2}
        value="a"
        onChange={() => undefined}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
      />
      <SegmentedRow
        ariaLabel="Mode 4"
        columns={4}
        value="a"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'A' }]}
      />
      <SegmentedRow
        ariaLabel="Mode 5"
        columns={5}
        value="a"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'A' }]}
      />
      <SegmentedRow
        ariaLabel="Mode default"
        value="a"
        onChange={() => undefined}
        options={[{ value: 'a', label: 'A' }]}
      />
      <SegmentedRow
        ariaLabel="Stacked mode"
        label="Camera mode"
        layout="stacked"
        columns={2}
        value="static"
        onChange={() => undefined}
        options={[
          { value: 'static', label: 'Static zoom' },
          { value: 'path', label: 'Moving zoom' },
        ]}
      />
    </>
  );
}

function renderPresetAndStateMarkup() {
  return renderToStaticMarkup(
    <>
      <StatusRow label="Status" value="Ready" />
      <SearchField label="Search" placeholder="Find" value="" onChange={() => undefined} />
      <PresetGroup group={{ id: 'empty', label: 'Empty', templates: [] }} />
      <PresetList
        emptyLabel="Empty presets"
        groups={[]}
        saveLabel="Save"
        onSave={() => undefined}
      />
      <FileActionRow onClick={() => undefined}>Import</FileActionRow>
      <EmptyState>No items</EmptyState>
    </>
  );
}

function assertPanelShellMarkup(markup: string) {
  expect(markup).toContain('Line');
  expect(markup).toContain('No value');
  expect(markup).toContain('aria-expanded="false"');
  expect(markup).toContain('aria-expanded="true"');
  expect(markup).toContain('Open body');
  expect(markup).toContain('Default body');
}

function assertFieldControlMarkup(markup: string) {
  expect(markup).toContain('shared.ui.compact-inspector.mini-scrubber');
  expect(markup).toContain('shared.ui.compact-select');
  expect(markup).toContain('shared.ui.compact-inspector.text-field');
  expect(markup).toContain('shared.ui.compact-inspector.textarea-field');
  expect(markup).toContain('min-w-0 !w-[8.75rem] max-w-[58%] shrink-0');
  expect(markup).toContain('w-[6.25rem] shrink-0');
  expect(markup).toContain('shared.ui.compact-inspector.numeric-range-scrub');
  expect(markup).toContain('shared.ui.compact-inspector.numeric-range-track');
  expect(markup).toContain('sniptale-range sniptale-range--edge absolute');
  expect(markup).toContain('width:auto');
  expect(markup).toContain('top:calc(var(--sniptale-range-thumb-size) / -2)');
  expect(markup).not.toContain('translate-y-1/2');
  expect(markup).toContain('h-8 min-w-0 w-full border-transparent');
}

function assertChoiceControlMarkup(markup: string) {
  expect(markup).toContain('grid-cols-2');
  expect(markup).toContain('grid-cols-4');
  expect(markup).toContain('grid-cols-5');
  expect(markup).toContain('grid-cols-3');
  expect(markup).toContain('shared.ui.compact-inspector.segmented-row');
  expect(markup).toContain('grid min-h-10 gap-2 rounded-[10px]');
  expect(markup).toContain('Camera mode');
  expect(markup).toContain('!whitespace-normal');
  expect(markup).toContain('disabled=""');
  expect(markup).toContain('shared.ui.compact-inspector.toggle-grid');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('Smoothing');
}

function assertPresetAndStateMarkup(markup: string) {
  expect(markup).toContain('shared.ui.compact-inspector.status-row');
  expect(markup).toContain('title="Status"');
  expect(markup).toContain('title="Ready"');
  expect(markup).toContain('Ready');
  expect(markup).toContain('Empty presets');
  expect(markup).toContain('Save');
  expect(markup).toContain('Import');
  expect(markup).toContain('No items');
}
