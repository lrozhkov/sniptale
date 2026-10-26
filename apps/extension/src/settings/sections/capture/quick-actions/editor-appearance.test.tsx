// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickActionAppearance } from '../../../../contracts/quick-action-appearance';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createSectionState } from './state.test-helpers';
import { saveEditedQuickAction } from './crud/editing';
import type { QuickAction } from '../../../../contracts/settings';
const mocks = vi.hoisted(() => ({
  persist: vi.fn(),
  favicon: vi.fn(),
  dataUrl: vi.fn(),
  intake: vi.fn(),
  intakeError: vi.fn(),
  icon: vi.fn(),
  paint: vi.fn(),
}));
vi.mock('../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../../../workflows/browser-frame/favicon', () => ({
  acquireWindowHeaderFavicon: mocks.favicon,
}));
vi.mock('../../../../composition/gradient-preset-resources/use-gradient-preset-catalog', () => ({
  useGradientPresetCatalog: () => ({ presets: [] }),
}));
vi.mock('../../../../ui/paint-selector', () => ({
  CompactPaintSelector: (props: { onChange: unknown }) => {
    mocks.paint(props.onChange);
    return <div />;
  },
}));
vi.mock('../../../../workflows/browser-frame/local-icon', () => ({
  WINDOW_HEADER_ICON_ACCEPT: 'image/*',
  importWindowHeaderIcon: mocks.icon,
}));
vi.mock('../../../../ui/compact-inspector-controls', async (original) => ({
  ...(await original<typeof import('../../../../ui/compact-inspector-controls')>()),
  SelectField: (props: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange(value: string): void;
  }) => (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  NumericRow: (props: {
    label: string;
    value: number;
    onPreviewValue(value: number): void;
    onCommitValue(value: number): void;
  }) => (
    <input
      aria-label={props.label}
      type="number"
      value={props.value}
      onChange={(event) => props.onPreviewValue(Number(event.target.value))}
      onBlur={(event) => props.onCommitValue(Number(event.target.value))}
    />
  ),
  ColorField: (props: { label: string; value: string; onChange(value: string): void }) => (
    <input
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));
vi.mock('../../../../platform/media-utils/data-url', async (original) => ({
  ...(await original<typeof import('../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mocks.dataUrl,
}));
vi.mock('../../../../composition/background-resources/picker', () => ({
  BackgroundImagePicker: (props: { onSelect: unknown; onError: unknown }) => {
    mocks.intake(props.onSelect);
    mocks.intakeError(props.onError);
    return <div />;
  },
}));
vi.mock('@sniptale/ui/product-modal', () => ({
  ProductModal: (props: { children: ReactNode; isOpen: boolean }) =>
    props.isOpen ? <div role="dialog">{props.children}</div> : null,
  ProductModalBody: (props: { children: ReactNode }) => <div>{props.children}</div>,
  ProductModalFooter: (props: { children: ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: () => <div />,
}));
import { QuickActionsEditor } from './editor';
let root: Root, container: HTMLDivElement;
let draft: QuickAction;
function Harness() {
  const base = createSectionState();
  const [form, setForm] = useState<QuickAction>(() => ({
    ...base.editForm!,
    appearance: {
      ...createQuickActionAppearance(),
      header: { ...DEFAULT_WINDOW_HEADER, faviconEnabled: true },
    },
  }));
  const [open, setOpen] = useState(true);
  draft = form;
  return (
    <QuickActionsEditor
      state={{
        ...base,
        actions: [],
        editForm: form,
        editingId: open ? form.id : null,
        updateFormField: (field, value) => setForm((current) => ({ ...current, [field]: value })),
        handleSaveEdit: () =>
          saveEditedQuickAction({
            actions: [],
            editForm: form,
            onPersist: mocks.persist,
            onResetEditor: () => setOpen(false),
          }),
        handleCancelEdit: () => setOpen(false),
      }}
      viewportPresets={[]}
    />
  );
}
function button(label: string) {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.persist.mockResolvedValue(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('opens appearance settings without persistence or favicon acquisition', async () => {
  await click('settings.quickActions.appearanceHeader');
  expect(container.querySelector('[data-ui="window-header-settings"]')).not.toBeNull();
  expect(mocks.favicon).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
  await click('settings.quickActions.appearanceInformation');
  expect(container.querySelector('[data-ui="window-header-settings"]')).toBeNull();
  await click('settings.quickActions.appearanceHeader');
  expect(draft.appearance?.header?.faviconEnabled).toBe(true);
  expect(mocks.favicon).not.toHaveBeenCalled();
});
it('keeps the draft after Save refusal and does not commit cancelled image intake', async () => {
  await click('common.actions.save');
  expect(mocks.persist).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  await click('settings.quickActions.appearanceBackground');
  const select = mocks.intake.mock.calls.at(-1)![0] as (
    image: { file: File },
    signal: AbortSignal
  ) => Promise<void>;
  let resolve!: (value: string) => void;
  mocks.dataUrl.mockReturnValue(
    new Promise<string>((accept) => {
      resolve = accept;
    })
  );
  const controller = new AbortController();
  let pending!: Promise<void>;
  await act(async () => {
    pending = select(
      { file: new File(['image'], 'background.png', { type: 'image/png' }) },
      controller.signal
    );
  });
  controller.abort();
  resolve('data:image/png;base64,cancelled');
  await expect(pending).rejects.toThrow();
  expect(draft.appearance?.background.kind).toBe('none');
  expect(draft.appearance?.background.imageDataUrl).toBeUndefined();
  await click('common.actions.cancel');
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.persist).toHaveBeenCalledOnce();
});

async function field(label: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${label}"]`
  );
  if (!element) throw new Error(`Missing field: ${label}`);
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
    );
    element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}
async function uploadIcon(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('edits explicit header sources and a local icon without losing the accepted draft', async () => {
  await click('settings.quickActions.appearanceHeader');
  await field('settings.quickActions.appearanceTitleSource', 'static');
  await field('windowHeader.tabTitle', 'Static title');
  await field('settings.quickActions.appearanceAddressSource', 'static');
  await field('windowHeader.address', 'https://static.example/');
  await field('settings.quickActions.appearanceIconSource', 'website');
  await field('settings.quickActions.appearanceIconWebsiteAddress', 'https://icon.example/');
  expect(draft.appearance).toMatchObject({
    titleSource: 'static',
    addressSource: 'static',
    faviconMode: 'website',
    faviconWebsite: 'https://icon.example/',
    header: { title: 'Static title', url: 'https://static.example/' },
  });
  await field('settings.quickActions.appearanceIconSource', 'upload');
  mocks.icon.mockResolvedValue('data:image/png;base64,aWNvbg==');
  await click('settings.quickActions.appearanceUploadIcon');
  await uploadIcon(new File(['icon'], 'icon.png', { type: 'image/png' }));
  expect(draft.appearance?.header?.faviconDataUrl).toBe('data:image/png;base64,aWNvbg==');
  mocks.icon.mockRejectedValueOnce(new Error('invalid icon'));
  await uploadIcon(new File(['bad'], 'bad.png'));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'windowHeader.fileUnavailable'
  );
  expect(draft.appearance?.header?.faviconDataUrl).toBe('data:image/png;base64,aWNvbg==');
  await click('settings.quickActions.appearanceIconEnabled');
  expect(draft.appearance?.header?.faviconEnabled).toBe(false);
  expect(draft.appearance?.header?.faviconDataUrl).toBeUndefined();
  expect(mocks.persist).not.toHaveBeenCalled();
});
it('discards late icon completion after the source changes', async () => {
  await click('settings.quickActions.appearanceHeader');
  await field('settings.quickActions.appearanceIconSource', 'upload');
  let resolve!: (value: string) => void;
  mocks.icon.mockReturnValue(
    new Promise<string>((accept) => {
      resolve = accept;
    })
  );
  await uploadIcon(new File(['icon'], 'icon.png'));
  await field('settings.quickActions.appearanceIconSource', 'page');
  await act(async () => resolve('data:image/png;base64,bGF0ZQ=='));
  expect(draft.appearance?.faviconMode).toBe('page');
  expect(draft.appearance?.header?.faviconDataUrl).toBeUndefined();
});
it('retains background controls and the previous image after intake refusal', async () => {
  await click('settings.quickActions.appearanceBackground');
  await field('settings.quickActions.appearanceBackgroundKind', 'paint');
  for (const [label, value] of [
    ['appearancePadding', '40'],
    ['appearanceRadius', '18'],
    ['appearanceShadow', '24'],
  ]) {
    await field(`settings.quickActions.${label}`, value!);
  }
  const paint = mocks.paint.mock.calls.at(-1)![0] as (value: {
    kind: 'solid';
    color: string;
  }) => void;
  await act(async () => paint({ kind: 'solid', color: '#112233ff' }));
  const select = mocks.intake.mock.calls.at(-1)![0] as (
    image: { file: File },
    signal: AbortSignal
  ) => Promise<void>;
  mocks.dataUrl.mockResolvedValue('data:image/png;base64,YWNjZXB0ZWQ=');
  await act(async () =>
    select({ file: new File(['image'], 'bg.png') }, new AbortController().signal)
  );
  await field('settings.quickActions.appearanceFit', 'contain');
  expect(draft.appearance?.background).toMatchObject({
    kind: 'image',
    padding: 40,
    radius: 18,
    shadow: 24,
    fit: 'contain',
  });
  const repaint = mocks.paint.mock.calls.at(-1)![0] as typeof paint;
  await act(async () => repaint({ kind: 'solid', color: '#445566ff' }));
  expect(draft.appearance?.background.kind).toBe('image');
  await expect(
    select(
      { file: new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png') },
      new AbortController().signal
    )
  ).rejects.toThrow('size limit');
  const failed = mocks.intakeError.mock.calls.at(-1)![0] as () => void;
  await act(async () => failed());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.quickActions.appearanceImageFailed'
  );
  expect(draft.appearance?.background.imageDataUrl).toBe('data:image/png;base64,YWNjZXB0ZWQ=');
});
it('edits caption placement, selected metadata and style without saving on navigation', async () => {
  await click('settings.quickActions.appearanceInformation');
  await click('settings.quickActions.appearanceInformationEnabled');
  await field('settings.quickActions.appearancePosition', 'above');
  for (const input of Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  )) {
    await act(async () => input.click());
  }
  await field('settings.quickActions.appearanceCaptionText', 'Static caption');
  await field('settings.quickActions.appearanceCaptionColor', '#123456ff');
  await field('settings.quickActions.appearanceCaptionSize', '24');
  expect(draft.appearance?.information).toMatchObject({
    enabled: true,
    position: 'above',
    text: 'Static caption',
    color: '#123456ff',
    size: 24,
  });
  await click('settings.quickActions.appearanceAction');
  await click('settings.quickActions.appearanceInformation');
  expect(draft.appearance?.information.text).toBe('Static caption');
  expect(mocks.persist).not.toHaveBeenCalled();
});
