// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

const { actionButtonPropsSpy, modalHeaderPropsSpy, modalPropsSpy } = vi.hoisted(() => ({
  actionButtonPropsSpy: vi.fn(),
  modalHeaderPropsSpy: vi.fn(),
  modalPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: string }
  ) => {
    actionButtonPropsSpy(props);
    return (
      <button type={props.type} disabled={props.disabled} onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => {
    modalPropsSpy(props);
    return (
      <div data-testid="modal" tabIndex={0} onKeyDown={props.onKeyDown}>
        {props.children}
      </div>
    );
  },
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { title: string; onClose: () => void }) => {
    modalHeaderPropsSpy(props);
    return <div>{props.title}</div>;
  },
}));

import { AiProvidersFormModalLayout } from './layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderLayout(overrides: Partial<Parameters<typeof AiProvidersFormModalLayout>[0]> = {}) {
  const props = {
    children: <div data-testid="child">Child</div>,
    isEditing: false,
    isSaving: false,
    mode: 'provider' as const,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<AiProvidersFormModalLayout {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  actionButtonPropsSpy.mockReset();
  modalHeaderPropsSpy.mockReset();
  modalPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function verifyProviderCreateLayout() {
  const props = renderLayout();

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
  });

  expect(container?.querySelector('[data-testid="child"]')).toBeTruthy();
  expect(modalHeaderPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: translate('settings.aiProviders.providerModalNewTitle'),
    })
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain(translate('common.actions.add'));
  expect(actionButtonPropsSpy).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ tone: 'secondary' })
  );
  expect(actionButtonPropsSpy).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ tone: 'primary', type: 'submit' })
  );
  expect(actionButtonPropsSpy.mock.calls[1]?.[0]).not.toHaveProperty('compact');
}

function verifyModelEditSavingLayout() {
  const props = renderLayout({
    isEditing: true,
    isSaving: true,
    mode: 'model',
  });

  act(() => {
    container
      ?.querySelector<HTMLElement>('[data-testid="modal"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(modalHeaderPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: translate('settings.aiProviders.modelModalEditTitle'),
    })
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain(`${translate('common.states.saving')}...`);
}

function runAiProvidersFormModalLayoutSuite() {
  it(
    'renders provider-create copy and wires cancel and submit actions',
    verifyProviderCreateLayout
  );
  it('renders model-edit saving copy and closes on Escape', verifyModelEditSavingLayout);
}

describe('AiProvidersFormModalLayout', runAiProvidersFormModalLayoutSuite);
