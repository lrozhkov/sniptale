// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import {
  CompactColorOption,
  CompactInput,
  CompactRange,
  CompactSelect,
  CompactTextarea,
  PanelHeader,
  PresetList,
  PresetRow,
  TextField,
  type PresetListGroup,
  type PresetListItem,
} from './index';
import './layout.interactions.test-support.tsx';
import './select-prevention.test-support.tsx';

const COMPACT_INTERACTIVE_SURFACE_MIX_STYLE = [
  '--sniptale-field-bg-hover:color-mix(in srgb,',
  ' var(--sniptale-color-surface-input) 78%,',
  ' var(--sniptale-color-surface-panel) 22%)',
].join('');

it('renders compact inspector inputs, ranges, selects, and color options', () => {
  const markup = renderToStaticMarkup(
    <div>
      <CompactInput value="Title" readOnly />
      <CompactTextarea value="Long-form text" readOnly />
      <TextField label="Title" value="Scene title" readOnly />
      <CompactRange min={0} max={100} defaultValue={32} />
      <CompactSelect
        aria-label="Mode"
        value="light"
        onChange={() => undefined}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <CompactColorOption active style={{ backgroundColor: '#2563eb' }} />
    </div>
  );

  expect(markup).toContain('sniptale-input');
  expect(markup).toContain('shared.ui.compact-textarea');
  expect(markup).toContain('sniptale-textarea');
  expect(markup).toContain('shared.ui.compact-inspector.text-field');
  expect(markup).toContain('rounded-[10px]');
  expect(markup).toContain('sniptale-range');
  expect(markup).toContain('--sniptale-range-fill-ratio:32%');
  expect(markup).toContain('style="--sniptale-field-height:40px');
  expect(markup).toContain('--sniptale-range-shell-height:40px');
  expect(markup).toContain('--sniptale-range-shell-padding-inline:0px');
  expect(markup).toContain('--sniptale-range-shell-border-hover:transparent');
  expect(markup).toContain('--sniptale-range-shell-bg-hover:transparent');
  expect(markup).toContain('--sniptale-range-shell-shadow-hover:none');
  expect(markup).toContain('--sniptale-range-shell-border-active:transparent');
  expect(markup).toContain('--sniptale-range-shell-bg-active:transparent');
  expect(markup).toContain('--sniptale-range-shell-shadow-active:none');
  expect(markup).toContain('shared.ui.compact-select');
  expect(markup).toContain('--sniptale-field-bg-idle:transparent');
  expect(markup).toContain(COMPACT_INTERACTIVE_SURFACE_MIX_STYLE);
  expect(markup).not.toContain('sniptale-select');
  expect(markup).not.toContain('sniptale-compact-select-shell');
  expect(markup).toContain('rounded-full');
});

it('keeps compact range ratio delegated through the shared range primitive', () => {
  const markup = renderToStaticMarkup(<CompactRange min={10} max={110} value={60} readOnly />);

  expect(markup).toContain('--sniptale-range-fill-ratio:50%');
});

it('keeps compact interactive vars out of dynamic arbitrary-property classes', () => {
  const markup = renderToStaticMarkup(
    <CompactSelect
      aria-label="Mode"
      value="light"
      onChange={() => undefined}
      options={[{ value: 'light', label: 'Light' }]}
    />
  );

  expect(markup).not.toContain('[--sniptale-field-height:40px]');
  expect(markup).not.toContain('${COMPACT_INSPECTOR_INTERACTIVE_SURFACE_MIX_VALUE}');
  expect(markup).not.toContain('shared.ui.product-select');
});

it('keeps the color option button owner on the default button type', () => {
  const markup = renderToStaticMarkup(<CompactColorOption />);

  expect(markup).toContain('type="button"');
  expect(markup).not.toContain('focus-visible:ring-2');
  expect(markup).not.toContain('var(--sniptale-color-accent)_66%');
});

it('renders title-only panel headers and grouped preset lists', () => {
  const typedGroup: PresetListGroup = { id: 'typed', label: 'Typed', templates: [] };
  const typedItem: PresetListItem = {
    id: 'typed-row',
    label: 'Typed row',
    onApply: () => undefined,
  };
  const markup = renderToStaticMarkup(
    <div>
      <PanelHeader>ПЛАВАЮЩИЕ ОБОЛОЧКИ</PanelHeader>
      <PresetList
        emptyLabel="No templates"
        groups={[
          {
            id: 'system',
            label: 'System',
            templates: [
              {
                id: 'preset-1',
                label: 'Default',
                selected: true,
                system: true,
                onApply: () => undefined,
              },
            ],
          },
          { id: 'user', label: 'User', templates: [] },
          typedGroup,
        ]}
      />
      <PresetRow item={typedItem} />
    </div>
  );

  expect(markup).toContain('ПЛАВАЮЩИЕ ОБОЛОЧКИ');
  expect(markup).toContain('<h3');
  expect(markup).not.toContain('aria-expanded');
  expect(markup).toContain('System');
  expect(markup).toContain('Default');
  expect(markup).toContain('Typed row');
  expect(markup).not.toContain('User');
  expect(markup).not.toContain('No templates');
});
