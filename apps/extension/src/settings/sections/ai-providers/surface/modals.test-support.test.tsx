// @vitest-environment jsdom

import { act } from 'react';
import type { FormEvent } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createModelState,
  createProviderState,
  createSubmittingState,
  MODEL,
  PROVIDER,
  renderIntoRoot,
  unmountRoot,
} from './modals.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await unmountRoot(root);
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function verifyStableFixturesAndDefaults() {
  const providerState = createProviderState();
  const modelState = createModelState();

  expect(PROVIDER).toMatchObject({
    id: 'provider-1',
    hasStoredApiKey: true,
  });
  expect(MODEL).toMatchObject({
    id: 'model-1',
    providerId: 'provider-1',
  });
  expect(providerState).toMatchObject({
    formData: expect.objectContaining({
      baseUrl: 'https://api.example.com',
    }),
    isEditing: false,
  });
  expect(modelState).toMatchObject({
    formData: expect.objectContaining({
      modelCode: 'gpt-4.1',
    }),
    isEditing: true,
  });

  providerState.handleApiKeyChange();
  providerState.handleChange()();
  void providerState.handleSubmit();
  modelState.handleChange()();
  modelState.handleProviderChange();
  modelState.handleResizeStart();
  void modelState.handleSubmit();
}

async function verifyRootRenderLifecycle() {
  const onSave = vi.fn(async () => undefined);
  const handleSubmit = vi.fn(async (_event: FormEvent, nextOnSave: () => Promise<void> | void) => {
    await nextOnSave();
  });
  const submitState = createSubmittingState(createProviderState(), handleSubmit);

  expect(submitState.handleSubmit).toBe(handleSubmit);

  const firstRender = await renderIntoRoot({
    container,
    node: <div data-testid="root-render">{submitState.formData.name}</div>,
    root,
  });
  container = firstRender.container;
  root = firstRender.root;

  await act(async () => {
    await submitState.handleSubmit({} as FormEvent, onSave);
  });

  expect(container?.textContent).toContain('Provider');
  expect(onSave).toHaveBeenCalledTimes(1);

  const secondRender = await renderIntoRoot({
    container,
    node: <div data-testid="root-render">rerendered</div>,
    root,
  });
  container = secondRender.container;
  root = secondRender.root;

  expect(container?.textContent).toContain('rerendered');
}

function runModalsTestSupportSuite() {
  it('exposes stable provider and model fixtures plus provider/model draft defaults', () => {
    verifyStableFixturesAndDefaults();
  });

  it(
    'wraps custom submit handlers and supports both first render and rerender root paths',
    verifyRootRenderLifecycle
  );
}

describe('modals test support', runModalsTestSupportSuite);
