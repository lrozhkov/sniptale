// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: vi.fn(() => 'Default textbox text'),
}));

import { createMetaStamp, createTextObject } from './';

it('creates fixed-width text objects with the initial insert flag and text layout metadata', () => {
  const textbox = createTextObject({
    id: 'text-1',
    initialInsertPending: true,
    labelIndex: 3,
    left: 40,
    top: 60,
    settings: {
      backgroundColor: '#111111',
      backgroundOpacity: 0.5,
      calloutFormat: 'panel',
      layoutMode: 'fixed-width',
      fontFamily: 'mono',
      fontSize: 16,
      fontStyle: 'italic',
      fontWeight: 'bold',
      linethrough: true,
      shadow: 30,
      shadowAngle: 135,
      shadowColor: '#ffffff',
      tailSize: 12,
      textAlign: 'center',
      verticalAlign: 'top',
      textColor: '#ffffff',
      textOpacity: 0.75,
      underline: true,
    },
  });

  expect(textbox.sniptaleId).toBe('text-1');
  expect(textbox.sniptaleTextInitialInsertPending).toBe(true);
  expect(textbox.sniptaleTextCalloutFormat).toBe('panel');
  expect(textbox.sniptaleTextLayoutMode).toBe('fixed-width');
  expect(textbox.sniptaleTextVerticalAlign).toBe('top');
  expect(textbox.sniptaleTextOpacity).toBe(0.75);
  expect(textbox.sniptaleTextShadowAngle).toBe(135);
  expect(textbox.sniptaleTextShadowColor).toBe('#ffffff');
  expect(textbox.sniptaleTextCalloutWidth).toBeGreaterThan(0);
  expect(textbox.sniptaleTextCalloutHeight).toBeGreaterThan(0);
  expect(textbox.textAlign).toBe('center');
  expect(textbox.backgroundColor).toBe('#111111');
  expect(textbox.padding).toBeGreaterThan(0);
  expect(textbox.lockScalingFlip).toBe(true);
});

it('creates plain text objects with a simple fixed-width box instead of callout defaults', () => {
  const textbox = createTextObject({
    id: 'text-plain',
    labelIndex: 1,
    left: 10,
    top: 20,
    settings: {
      backgroundColor: '#ffee00',
      backgroundOpacity: 0.5,
      calloutFormat: 'plain',
      layoutMode: 'fixed-width',
      fontFamily: 'sans',
      fontSize: 16,
      fontStyle: 'normal',
      fontWeight: 'normal',
      linethrough: false,
      shadow: 0,
      shadowAngle: 90,
      shadowColor: '#111827',
      tailSize: 0,
      textAlign: 'left',
      verticalAlign: 'center',
      textColor: '#111827',
      textOpacity: 1,
      underline: false,
    },
  });

  expect(textbox.sniptaleTextCalloutFormat).toBe('plain');
  expect(textbox.sniptaleTextCalloutWidth).toBe(280);
  expect(textbox.sniptaleTextCalloutHeight).toBeLessThan(120);
  expect(textbox.padding).toBe(0);
  expect(textbox.textBackgroundColor).toContain('rgba');
});

function registerMetaStampCreationTest() {
  it('creates fixed-width default meta stamps through the shared text owner seam', () => {
    const stamp = createMetaStamp('browser', 'Chrome', 12, 18, 2);

    expect(stamp.sniptaleType).toBe('meta-stamp');
    expect(stamp.sniptaleMetaKind).toBe('browser');
    expect(stamp.sniptaleTextCalloutFormat).toBe('panel');
    expect(stamp.sniptaleTextLayoutMode).toBe('fixed-width');
    expect(stamp.sniptaleTextVerticalAlign).toBe('top');
    expect(stamp.padding).toBeGreaterThan(0);
    expect(stamp.textAlign).toBe('left');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

registerMetaStampCreationTest();
