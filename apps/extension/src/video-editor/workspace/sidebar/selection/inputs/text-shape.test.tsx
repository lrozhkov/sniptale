// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createShapeClip,
  createTextClip,
} from '../../../../../features/video/project/factories/overlay-clip';
import {
  VideoOverlayTemplateKind,
  VideoProjectShapeType,
} from '../../../../../features/video/project/types';
import { renderTextAndShapeFields } from './text-shape';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderFields() {
  const onConvertTextClipToAnnotation = vi.fn();
  const onUpdateTextStyle = vi.fn();
  const clip = createTextClip('track-overlay', 1280, 720, 0);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <div>
        {renderTextAndShapeFields(
          clip,
          false,
          [],
          vi.fn(async () => undefined),
          vi.fn(),
          onUpdateTextStyle,
          vi.fn(),
          onConvertTextClipToAnnotation,
          vi.fn(),
          vi.fn(),
          vi.fn()
        )}
      </div>
    );
  });

  return { clip, onConvertTextClipToAnnotation, onUpdateTextStyle };
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workspace-sidebar/selection/text-shape', () => {
  registerTextFieldTests();
  registerShapeFieldTests();
  registerTextConversionTests();
});

function registerTextFieldTests() {
  it('renders the full text style surface with shared controls', async () => {
    const { onUpdateTextStyle } = await renderFields();

    expect(container?.textContent).toContain('videoEditor.sidebar.textWeightLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.textLineHeightLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.textColorLabel');
    expect(
      container?.querySelector('[data-ui="shared.ui.compact-inspector.segmented-field"]')
    ).not.toBeNull();

    const weightRange = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
    ).find((input) => input.getAttribute('max') === '900');

    await act(async () => {
      setInputValue(weightRange!, '700');
    });

    expect(onUpdateTextStyle).toHaveBeenCalledWith(expect.any(String), { fontWeight: 700 });
  });
}

function registerShapeFieldTests() {
  it('renders shape stroke controls through shared color and numeric rows', async () => {
    const onUpdateShapeStyle = vi.fn();
    const clip = createShapeClip('track-overlay', 1280, 720, 0, VideoProjectShapeType.RECTANGLE);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <div>
          {renderTextAndShapeFields(
            clip,
            false,
            [],
            vi.fn(async () => undefined),
            vi.fn(),
            vi.fn(),
            onUpdateShapeStyle
          )}
        </div>
      );
    });

    expect(container?.textContent).toContain('videoEditor.sidebar.strokeLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.strokeWidthLabel');

    const strokeRange = Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
    ).find((input) => input.getAttribute('aria-label')?.includes('strokeWidthLabel'));

    await act(async () => {
      setInputValue(strokeRange!, '6');
    });

    expect(onUpdateShapeStyle).toHaveBeenCalledWith(clip.id, { strokeWidth: 6 });
  });
}

function registerTextConversionTests() {
  it('offers text clips a template conversion action with a default lower-third preset', async () => {
    const { clip, onConvertTextClipToAnnotation } = await renderFields();

    expect(container?.textContent).toContain('videoEditor.sidebar.textTemplateUpgradeLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.textTemplateUpgradeDescription');
    expect(findButton('videoEditor.sidebar.textTemplateUpgradeAction')?.className).toContain(
      'hover:text-[var(--sniptale-color-accent-emphasis)]'
    );

    await act(async () => {
      findButton('videoEditor.sidebar.textTemplateUpgradeAction')?.click();
    });

    expect(onConvertTextClipToAnnotation).toHaveBeenCalledWith(
      clip.id,
      VideoOverlayTemplateKind.LOWER_THIRD_BASIC
    );
  });
}
