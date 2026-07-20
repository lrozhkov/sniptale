import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ProductField,
  ProductInput,
  ProductKeyboardHint,
  ProductRange,
  ProductSelect,
  ProductTextarea,
  ProductToggle,
} from '@sniptale/ui/product-form-controls';

function renderAllControlsMarkup() {
  return renderToStaticMarkup(
    <div>
      <ProductField label="Prompt" error="Required" hint="Used for generation">
        <ProductInput value="Describe the scene" readOnly invalid />
      </ProductField>
      <ProductSelect
        value="window"
        onChange={() => undefined}
        options={[
          { value: 'window', label: 'Window' },
          { value: 'full', label: 'Full page' },
        ]}
      />
      <ProductTextarea value="Long-form text" readOnly invalid />
      <ProductToggle checked onClick={() => undefined} />
      <ProductRange defaultValue={60} />
      <ProductKeyboardHint shortcut="Ctrl+Enter">run action</ProductKeyboardHint>
    </div>
  );
}

function registerProductRangeTests() {
  it('renders controlled range fill ratio from min, max, and value', () => {
    const markup = renderToStaticMarkup(
      <ProductRange min={10} max={100} value={55} readOnly style={{ width: '80%' }} />
    );

    expect(markup).toContain('--sniptale-range-fill-ratio:50%');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('sniptale-range');
    expect(markup).toContain('width:80%');
  });

  it('renders predictable range ratios for defaults, clamped values, and invalid spans', () => {
    expect(renderToStaticMarkup(<ProductRange min={0} max={10} defaultValue={2.5} />)).toContain(
      '--sniptale-range-fill-ratio:25%'
    );
    expect(renderToStaticMarkup(<ProductRange min={10} max={100} value={0} readOnly />)).toContain(
      '--sniptale-range-fill-ratio:0%'
    );
    expect(
      renderToStaticMarkup(<ProductRange min={10} max={100} value={200} readOnly />)
    ).toContain('--sniptale-range-fill-ratio:100%');
    expect(renderToStaticMarkup(<ProductRange min={100} max={10} value={75} readOnly />)).toContain(
      '--sniptale-range-fill-ratio:75%'
    );
  });
}

function registerRenderAllControlsTest() {
  it('renders field copy, invalid states, and keyboard hints', () => {
    const markup = renderAllControlsMarkup();

    expect(markup).toContain('sniptale-label-sm');
    expect(markup).toContain('sniptale-error-text');
    expect(markup).toContain('sniptale-input sniptale-input-error');
    expect(markup).toContain('sniptale-select');
    expect(markup).toContain('sniptale-textarea sniptale-input-error');
    expect(markup).toContain('sniptale-product-toggle');
    expect(markup).toContain('sniptale-range');
    expect(markup).toContain('sniptale-kbd');
    expect(markup).toContain('run action');
  });
}

function registerOptionalWrapperOmissionTest() {
  it('omits optional field wrappers and supports compact toggle variants', () => {
    const markup = renderToStaticMarkup(
      <div>
        <ProductField>
          <ProductInput value="Plain field" readOnly />
        </ProductField>
        <ProductTextarea value="Plain text" readOnly />
        <ProductToggle checked={false} size="sm" onClick={() => undefined} />
      </div>
    );

    expect(markup).not.toContain('sniptale-label-sm');
    expect(markup).not.toContain('sniptale-error-text');
    expect(markup).not.toContain('text-[var(--sniptale-color-text-dim)]');
    expect(markup).toContain('sniptale-product-toggle-sm');
    expect(markup).toContain('aria-checked="false"');
  });
}

function registerToggleSemanticsTest() {
  it('renders toggles with switch semantics', () => {
    const markup = renderToStaticMarkup(<ProductToggle checked onClick={() => undefined} />);

    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).not.toContain('aria-pressed');
  });
}

function registerPlaceholderTest() {
  it('renders placeholder options as non-selectable prompts', () => {
    const markup = renderToStaticMarkup(
      <ProductSelect
        value=""
        onChange={() => undefined}
        placeholder="Pick a provider"
        options={[{ value: 'openai', label: 'OpenAI' }]}
      />
    );

    expect(markup).toContain('sniptale-select-placeholder');
    expect(markup).toContain('Pick a provider');
    expect(markup).not.toContain('<select');
  });
}

function registerSelectLabelContractTest() {
  it('renders explicit trigger and menu label wrappers for compact select copy policies', () => {
    const markup = renderToStaticMarkup(
      <ProductSelect
        value="window"
        onChange={() => undefined}
        options={[
          {
            value: 'window',
            label: 'Very long preset name for trigger validation',
            description: 'Applies to the whole viewport',
            icon: <span data-testid="preview">preview</span>,
          },
        ]}
      />
    );

    expect(markup).toContain('sniptale-select-value-label sniptale-select-value-label-trigger');
    expect(markup).toContain('sniptale-select-option-description');
    expect(markup).toContain('data-testid="preview"');
  });
}

describe('ProductFormControls', () => {
  registerRenderAllControlsTest();
  registerOptionalWrapperOmissionTest();
  registerToggleSemanticsTest();
  registerPlaceholderTest();
  registerSelectLabelContractTest();

  registerProductRangeTests();
});
