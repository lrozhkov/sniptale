import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const { inputPropsSpy, selectPropsSpy } = vi.hoisted(() => ({
  inputPropsSpy: vi.fn(),
  selectPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductField: ({ children, label }: { children: React.ReactNode; label: React.ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => {
    inputPropsSpy(props);
    return <input {...props} />;
  },
  ProductSelect: (props: unknown) => {
    selectPropsSpy(props);
    return <div data-testid="target-select" />;
  },
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModalBody: ({ children }: { children: React.ReactNode }) => <form>{children}</form>,
  ProductModalFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
}));

import { ViewportPresetEditorContent, ViewportPresetEditorFooter } from './views';

it('edits bounded integer dimensions for browser-window presets', () => {
  const setHeight = vi.fn();
  const setLabel = vi.fn();
  const setWidth = vi.fn();
  const markup = renderToStaticMarkup(
    <ViewportPresetEditorContent
      height={720}
      isDisabled={false}
      label="Desktop"
      onSubmit={vi.fn()}
      setHeight={setHeight}
      setLabel={setLabel}
      setWidth={setWidth}
      width={1280}
    />
  );

  expect(markup).toContain('max="16384"');
  expect(markup).toContain('maxLength="80"');
  expect(markup).not.toContain('sniptale-modal-field-surface');
  expect(selectPropsSpy).not.toHaveBeenCalled();

  const inputs = inputPropsSpy.mock.calls.map(([props]) => props);
  inputs[0]?.onChange?.({ target: { value: 'Renamed' } });
  inputs[1]?.onChange?.({ target: { value: '20000' } });
  inputs[2]?.onChange?.({ target: { value: '0' } });
  expect(setLabel).toHaveBeenCalledWith('Renamed');
  expect(setWidth).toHaveBeenCalledWith(16384);
  expect(setHeight).toHaveBeenCalledWith(1);
});

it('disables footer actions while saving', () => {
  const markup = renderToStaticMarkup(
    <ViewportPresetEditorFooter
      disabled
      isSaving
      label="Desktop"
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />
  );

  expect(markup).toContain('disabled=""');
});

it('renders edit submit copy and disables an empty enabled form', () => {
  const markup = renderToStaticMarkup(
    <ViewportPresetEditorFooter
      disabled={false}
      isSaving={false}
      label="   "
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      preset={{
        enabled: true,
        height: 720,
        id: 'viewport',
        kind: 'user',
        name: 'Viewport',
        order: 0,
        target: 'window',
        width: 1280,
      }}
    />
  );

  expect(markup).toContain('disabled=""');
});
