// @vitest-environment jsdom

import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

function renderProductSelect(props: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <select
      data-testid="product-select"
      disabled={Boolean(props.disabled)}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  ProductSelect: renderProductSelect,
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: {
    children: React.ReactNode;
    onClick: () => void | Promise<void>;
  }) => <button onClick={() => void props.onClick()}>{props.children}</button>,
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: { children: React.ReactNode; isOpen: boolean }) =>
    props.isOpen ? <div data-testid="product-modal">{props.children}</div> : null,
  ProductModalBody: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { onClose: () => void; title: string }) => (
    <div>
      <div>{props.title}</div>
      <button data-action="close-modal" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    isOpen: boolean;
    message: string;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
  }) =>
    props.isOpen ? (
      <div data-testid="confirm-dialog">
        <div>{props.title}</div>
        <div>{props.message}</div>
        <button data-action="confirm" onClick={() => void props.onConfirm()}>
          {props.confirmText}
        </button>
        <button data-action="cancel" onClick={props.onCancel}>
          {props.cancelText}
        </button>
      </div>
    ) : null,
}));

import {
  createSectionState,
  getQuickActionsContainer,
  renderQuickActionsSection,
  useQuickActionsControllerSpy,
} from './test-helpers';

async function renderState(state: ReturnType<typeof createSectionState>) {
  useQuickActionsControllerSpy.mockReturnValue(state);
  await renderQuickActionsSection();
  return getQuickActionsContainer();
}

async function verifyDelayedLoadingBranch() {
  const container = await renderState(
    createSectionState({
      actions: [],
      confirmDelete: null,
      confirmationMessage: null,
      editingId: null,
      editForm: null,
      hoveredId: null,
      isLoading: true,
    })
  );
  expect(container?.querySelector('[data-testid="settings-card-loading"]')).not.toBeNull();
  expect(container?.textContent).toContain('settings.navigation.quickactions');
  expect(container?.textContent).toContain('settings.quickActions.subtitle');
  expect(container?.textContent).not.toContain('Quick action saved');
}

async function verifyEmptyState() {
  const container = await renderState(
    createSectionState({
      actions: [],
      confirmDelete: null,
      confirmationMessage: null,
      editingId: null,
      editForm: null,
      hoveredId: null,
    })
  );
  expect(container?.textContent).toContain('settings.quickActions.emptyTitle');
  expect(container?.textContent).toContain('settings.quickActions.emptyDescriptionPrefix');
  expect(container?.querySelector('[data-testid="product-modal"]')).toBeNull();
  expect(container?.querySelector('[role="status"]')).toBeNull();
}

async function verifyDraftState() {
  const container = await renderState(
    createSectionState({
      actions: [],
      confirmDelete: null,
      confirmationMessage: null,
      editingId: 'draft-action',
      hoveredId: null,
    })
  );
  expect(container?.textContent).toContain('settings.quickActions.newTitle');
  expect(container?.textContent).not.toContain('settings.quickActions.emptyTitle');
  expect(container?.querySelector('[data-testid="product-modal"]')).not.toBeNull();
}

async function verifySavedRowsAndDeleteConfirmation() {
  const container = await renderState(createSectionState());

  expect(container?.textContent).toContain('Visible capture');
  expect(container?.textContent).toContain('settings.quickActions.deleteActionTitle');
  expect(container?.querySelector('[data-testid="confirm-dialog"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="product-select"]')).not.toBeNull();
}

function runQuickActionsSectionStateSuite() {
  it('renders the delayed loading branch for an empty owner state', async () => {
    await verifyDelayedLoadingBranch();
  });

  it('renders the empty state and keeps the editor closed when no draft is active', async () => {
    await verifyEmptyState();
  });

  it('renders the new-action editor title and suppresses the empty state while drafting', async () => {
    await verifyDraftState();
  });

  it('renders saved action rows with the delete confirmation branch', async () => {
    await verifySavedRowsAndDeleteConfirmation();
  });
}

describe('QuickActionsSection states', runQuickActionsSectionStateSuite);
