// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { EditorStepSettings } from '../../../features/editor/document/step-types';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: () => 'Type here',
}));

import { createMetaStamp, createStepGroup, createTextObject, updateStepGroup } from './';

const baseStepSettings: EditorStepSettings = {
  alphabet: 'latin',
  color: '#ff671d',
  opacity: 1,
  sizeLevel: 3,
  strokeColor: '#f8fafc',
  strokeOpacity: 1,
  strokeWidth: 2,
  textColor: '#ffffff',
  type: 'number',
  value: '1',
};

function createStepSettings(overrides: Partial<EditorStepSettings>): EditorStepSettings {
  return { ...baseStepSettings, ...overrides };
}

function createPointerTextSettings() {
  return {
    backgroundColor: '#fff',
    fontFamily: 'sans',
    fontSize: 18,
    fontWeight: 'bold',
    fontStyle: 'italic',
    underline: true,
    linethrough: true,
    backgroundOpacity: 0.45,
    shadow: 30,
    shadowAngle: 135,
    shadowColor: '#111',
    textColor: '#111',
    textOpacity: 0.8,
    calloutFormat: 'pointer',
    layoutMode: 'fixed-width',
    textAlign: 'left',
  } as never;
}

function runStepCreationSuite() {
  it('creates step groups with canvas metadata and size-based geometry', () => {
    const step = createStepGroup({
      id: 'step-1',
      labelIndex: 3,
      left: 40,
      settings: createStepSettings({
        sizeLevel: 4,
        value: '7',
      }),
      top: 80,
    });

    expect(step.sniptaleId).toBe('step-1');
    expect(step.sniptaleType).toBe('step');
    expect(step.sniptaleRole).toBe('annotation');
    expect(step.sniptaleLabel).toContain('3');
    expect(step.sniptaleStepValue).toBe('7');

    const [circle, text] = step.getObjects();
    expect(circle?.get('radius')).toBeGreaterThan(16);
    expect(circle?.get('strokeUniform')).toBe(true);
    expect(text?.get('fontSize')).toBeGreaterThan(17);
  });
}

function runStepGeometrySuite() {
  it('changes circle and text geometry across step size levels', () => {
    const small = createStepGroup({
      id: 'step-small',
      labelIndex: 1,
      left: 0,
      settings: createStepSettings({
        sizeLevel: 0,
      }),
      top: 0,
    });
    const large = createStepGroup({
      id: 'step-large',
      labelIndex: 2,
      left: 0,
      settings: createStepSettings({
        sizeLevel: 20,
      }),
      top: 0,
    });

    const [smallCircle, smallText] = small.getObjects();
    const [largeCircle, largeText] = large.getObjects();

    expect(largeCircle?.get('radius')).toBeGreaterThan(smallCircle?.get('radius') as number);
    expect(largeText?.get('fontSize')).toBeGreaterThan(smallText?.get('fontSize') as number);
    expect(largeText?.get('width')).toBeGreaterThan(smallText?.get('width') as number);
  });
}

function runStepUpdateSuite() {
  it('keeps the step circle stroke uniform after size updates', () => {
    const step = createStepGroup({
      id: 'step-update',
      labelIndex: 2,
      left: 24,
      settings: createStepSettings({
        sizeLevel: 2,
        value: '2',
      }),
      top: 48,
    });

    updateStepGroup(
      step,
      createStepSettings({
        color: '#222222',
        sizeLevel: 20,
        value: '9',
      })
    );

    const [circle, text] = step.getObjects();
    expect(circle?.get('fill')).toBe('rgba(34, 34, 34, 1)');
    expect(circle?.get('strokeUniform')).toBe(true);
    expect(circle?.get('radius')).toBeGreaterThan(16);
    expect(text?.get('text')).toBe('9');
    expect((text?.get('fontSize') as number) ?? 0).toBeGreaterThan(17);
  });
}

it('creates editable text boxes with expected ownership metadata', () => {
  const text = createTextObject({
    id: 'text-1',
    labelIndex: 2,
    left: 10,
    settings: createPointerTextSettings(),
    top: 20,
  });

  expect(text).toMatchObject({
    fontStyle: 'italic',
    linethrough: true,
    sniptaleId: 'text-1',
    sniptaleRole: 'annotation',
    sniptaleTextBackgroundOpacity: 0.45,
    sniptaleTextCalloutFormat: 'pointer',
    sniptaleTextCalloutHeight: 120,
    sniptaleTextCalloutShadow: 30,
    sniptaleTextCalloutWidth: 420,
    sniptaleTextOpacity: 0.8,
    sniptaleTextShadowAngle: 135,
    sniptaleTextShadowColor: '#111',
    sniptaleType: 'text',
    text: 'Type here',
    underline: true,
    width: 348,
  });
});

it('creates meta stamps with expected ownership metadata', () => {
  const stamp = createMetaStamp('browser', 'Firefox', 4, 8, 5);

  expect(stamp.sniptaleType).toBe('meta-stamp');
  expect(stamp.sniptaleRole).toBe('stamp');
  expect(stamp.sniptaleMetaKind).toBe('browser');
  expect(stamp.text).toBe('Firefox');
  expect(stamp.sniptaleTextCalloutFormat).toBe('panel');
  expect(stamp.sniptaleTextCalloutWidth).toBe(420);
  expect(stamp.sniptaleTextCalloutHeight).toBe(120);
});

function runPlainFormatSuite() {
  it('creates plain text boxes without background fill and clamps min width', () => {
    const plain = createTextObject({
      id: 'text-2',
      labelIndex: 1,
      left: 4,
      settings: {
        backgroundColor: '#fff',
        fontFamily: 'sans',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        linethrough: false,
        backgroundOpacity: 0.2,
        shadow: 100,
        shadowAngle: 180,
        shadowColor: '#111',
        textColor: '#111',
        textOpacity: 1,
        calloutFormat: 'plain',
        layoutMode: 'fixed-width',
        textAlign: 'left',
      } as never,
      top: 8,
    });

    expect(plain.width).toBe(280);
    expect(plain.backgroundColor).toBe('');
    expect(plain.textBackgroundColor).toBe('rgba(255, 255, 255, 0.2)');
    expect(plain.sniptaleTextBackgroundOpacity).toBe(0.2);
    expect(plain.sniptaleTextCalloutShadow).toBe(100);
    expect(plain.sniptaleTextShadowAngle).toBe(180);
    expect(plain.padding).toBe(0);
  });
}

it('uses a custom initial text value when one is provided', () => {
  const text = createTextObject({
    id: 'text-3',
    labelIndex: 3,
    left: 12,
    settings: {
      backgroundColor: '#fff',
      fontFamily: 'sans',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      linethrough: false,
      backgroundOpacity: 0.2,
      shadow: 0,
      shadowAngle: 90,
      shadowColor: '#111',
      textColor: '#111',
      textOpacity: 1,
      calloutFormat: 'plain',
      layoutMode: 'fixed-width',
      textAlign: 'left',
    } as never,
    text: 'Page URL\nhttps://example.com',
    top: 16,
  });

  expect(text.text).toBe('Page URL\nhttps://example.com');
  expect(text.sniptaleType).toBe('text');
});

runStepCreationSuite();
runStepGeometrySuite();
runStepUpdateSuite();
runPlainFormatSuite();
