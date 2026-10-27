// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModel } from '../../../../../contracts/settings';
import { useModelFormState } from './hooks';
import { ModelFormModal } from '../surface/modals';
import { translate } from '../../../../../platform/i18n';

const { addModel, updateModel } = vi.hoisted(() => ({
  addModel: vi.fn(),
  updateModel: vi.fn(),
}));
vi.mock('../../../../runtime/ai-settings/mutations', async (original) => ({
  ...(await original<typeof import('../../../../runtime/ai-settings/mutations')>()),
  addAIModel: addModel,
  updateAIModel: updateModel,
}));
vi.mock('@sniptale/platform/observability/logger', async (original) => ({
  ...(await original<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ error: vi.fn() }),
}));

const MODEL: AIModel = {
  id: '00000000-0000-4000-8000-000000000001',
  providerId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Model',
  modelCode: 'model-code',
};
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useModelFormState>;

function Harness(props: { model?: AIModel; onSave: () => Promise<void> }) {
  state = useModelFormState(props.model);
  return (
    <form onSubmit={(event) => void state.handleSubmit(event, props.onSave)}>
      <input
        aria-label="Name"
        value={state.formData.displayName}
        onChange={state.handleChange('displayName')}
      />
      <div role="alert">{state.errors['submit']}</div>
      <button disabled={state.isSaving}>Save</button>
    </form>
  );
}

async function mount(onSave = vi.fn().mockResolvedValue(undefined), model?: AIModel) {
  await act(async () => root.render(<Harness onSave={onSave} {...(model ? { model } : {})} />));
  if (!model) {
    await act(async () => {
      state.handleProviderChange(MODEL.providerId);
      state.handleChange('displayName')({
        target: { value: MODEL.displayName },
      } as React.ChangeEvent<HTMLInputElement>);
      state.handleChange('modelCode')({
        target: { value: MODEL.modelCode },
      } as React.ChangeEvent<HTMLInputElement>);
    });
  }
  return onSave;
}
async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  addModel.mockReset().mockResolvedValue(undefined);
  updateModel.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('retries reload without a second create after an acknowledged write', async () => {
  const reload = await mount(
    vi.fn().mockRejectedValueOnce(new Error('reload failed')).mockResolvedValue(undefined)
  );
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).not.toBe('');
  expect(container.querySelector('input')?.value).toBe('Model');
  expect(container.querySelector('button')?.disabled).toBe(false);
  await submit();
  expect(addModel).toHaveBeenCalledTimes(1);
  expect(updateModel).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('');
});

it('updates an edited draft with the acknowledged record identity after reload failure', async () => {
  await mount(
    vi.fn().mockRejectedValueOnce(new Error('reload failed')).mockResolvedValue(undefined)
  );
  await submit();
  const saved = addModel.mock.calls[0]?.[0];
  await act(async () => {
    state.handleChange('displayName')({
      target: { value: 'Changed' },
    } as React.ChangeEvent<HTMLInputElement>);
  });
  await submit();
  expect(addModel).toHaveBeenCalledTimes(1);
  expect(updateModel).toHaveBeenCalledWith(
    expect.objectContaining({ id: saved.id, displayName: 'Changed' })
  );
});

it('uses the same create identity after a refused write and keeps reload separate', async () => {
  addModel.mockRejectedValueOnce(new Error('write refused')).mockResolvedValue(undefined);
  const reload = await mount();
  await submit();
  expect(reload).not.toHaveBeenCalled();
  await submit();
  expect(addModel).toHaveBeenCalledTimes(2);
  expect(addModel.mock.calls[0]?.[0].id).toBe(addModel.mock.calls[1]?.[0].id);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('ignores concurrent submit events until the current mutation and reload finish', async () => {
  let finishWrite: () => void = () => {
    throw new Error('Write not started');
  };
  addModel.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishWrite = resolve;
      })
  );
  const reload = await mount();
  await submit();
  await submit();
  expect(addModel).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
  await act(async () => finishWrite());
  expect(reload).toHaveBeenCalledTimes(1);
});

it('keeps existing model edits on their original identity during reload retry', async () => {
  await mount(
    vi.fn().mockRejectedValueOnce(new Error('reload failed')).mockResolvedValue(undefined),
    MODEL
  );
  await submit();
  await submit();
  expect(addModel).not.toHaveBeenCalled();
  expect(updateModel).toHaveBeenCalledTimes(1);
  expect(updateModel).toHaveBeenCalledWith(expect.objectContaining({ id: MODEL.id }));
});

it('does not publish an invalid draft', async () => {
  await act(async () => root.render(<Harness onSave={vi.fn()} />));
  await submit();
  expect(addModel).not.toHaveBeenCalled();
  expect(updateModel).not.toHaveBeenCalled();
});

it('keeps the real modal editable after reload refusal and retries from its Save button', async () => {
  const reload = vi
    .fn()
    .mockRejectedValueOnce(new Error('reload failed'))
    .mockResolvedValue(undefined);
  await act(async () =>
    root.render(
      <ModelFormModal
        model={MODEL}
        providers={[
          {
            id: MODEL.providerId,
            name: 'Provider',
            connectionType: 'openai-compatible',
            baseUrl: 'https://example.test/v1',
            hasStoredApiKey: false,
            createdAt: 1,
          },
        ]}
        onClose={vi.fn()}
        onSave={reload}
      />
    )
  );
  const save = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent === translate('common.actions.save')
  );
  if (!save) throw new Error('Save action unavailable');
  await act(async () => save.click());
  expect(document.querySelector('[role="alert"]')?.textContent).not.toBe('');
  const name = Array.from(document.querySelectorAll('input')).find(
    (input) => input.value === MODEL.displayName
  );
  expect(name?.disabled).toBe(false);
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(updateModel).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it('blocks another submit while reload is pending after persistence succeeds', async () => {
  let finishReload: () => void = () => {
    throw new Error('Reload not started');
  };
  const reload = await mount(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishReload = resolve;
        })
    )
  );
  await submit();
  await submit();
  expect(addModel).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(container.querySelector('button')?.disabled).toBe(true);
  await act(async () => finishReload());
  expect(container.querySelector('button')?.disabled).toBe(false);
});

it('assigns independent identities when a new form replaces a closed form', async () => {
  await mount();
  await submit();
  const firstId = addModel.mock.calls[0]?.[0].id;
  act(() => root.unmount());
  root = createRoot(container);
  await mount();
  await submit();
  expect(addModel).toHaveBeenCalledTimes(2);
  expect(addModel.mock.calls[1]?.[0].id).not.toBe(firstId);
});
