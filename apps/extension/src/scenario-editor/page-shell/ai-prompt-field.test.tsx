// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator } from '../../platform/i18n';
const io = vi.hoisted(() => ({
  select: vi.fn(),
  navigate: vi.fn(),
  change: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  state: { isLoading: false, isMutating: false, error: null as string | null },
}));
vi.mock('../../features/prompt-templates/hooks/use-prompt-templates', () => ({
  usePromptTemplates: (scope: string) => {
    if (scope !== 'scenario') throw new Error('Wrong template scope');
    return {
      ...io.state,
      selectTemplate: io.select,
      templates: [
        { id: 'enabled', name: 'Compact', content: 'Shorten the selected text', enabled: true },
        { id: 'disabled', name: 'Hidden', content: 'Disabled prompt', enabled: false },
      ],
    };
  },
}));
vi.mock('../../platform/navigation/extension-pages', () => ({ openSettingsPage: io.navigate }));
vi.mock('../../composition/voice-input/session', () => ({
  useVoiceInputSession: () => ({
    actions: { start: io.start, stop: io.stop },
    state: { active: false, audioLevel: 0, phase: 'idle', errorCode: null },
  }),
}));
vi.mock('@sniptale/ui/product-form-controls', async (original) => ({
  ...(await original<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    disabled: boolean;
    options: Array<{ value: string; label: string }>;
    onChange(id: string): void;
  }) => (
    <select disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)}>
      <option value="">Choose</option>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
import { GuideAiPromptField } from './ai-prompt-field';
let host: HTMLDivElement;
let root: Root;
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <GuideAiPromptField
        value="Existing"
        onChange={io.change}
        disabled={disabled}
        t={createTranslator('en')}
      />
    )
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.state = { isLoading: false, isMutating: false, error: null };
  io.select.mockResolvedValue('Shorten the selected text');
  io.navigate.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('inserts only enabled scenario templates immediately without a late overwrite', async () => {
  let finish!: () => void;
  io.select.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  await render();
  expect(host.textContent).not.toContain('Hidden');
  const select = host.querySelector('select')!;
  await act(async () => {
    select.value = 'enabled';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(io.change).toHaveBeenCalledExactlyOnceWith('Shorten the selected text');
  await act(async () => finish());
  expect(io.change).toHaveBeenCalledTimes(1);
});
it('disables field controls while pending and exposes template/settings failures', async () => {
  await render(true);
  expect(host.querySelector('textarea')?.disabled).toBe(true);
  expect(host.querySelector('select')?.disabled).toBe(true);
  expect([...host.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  io.state.error = 'Templates unavailable';
  io.navigate.mockRejectedValue(new Error('Unavailable'));
  await render();
  await act(async () =>
    host.querySelector<HTMLButtonElement>('.guide-ai-prompt-templates button')!.click()
  );
  expect(io.navigate).toHaveBeenCalledWith({
    route: { section: 'ai-prompts', view: 'scenario-templates' },
  });
  expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
});
