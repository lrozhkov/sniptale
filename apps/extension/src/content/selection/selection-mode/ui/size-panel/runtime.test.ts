// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSelectionModeSession } from '../../session';
import { createSelectionModeSizePanelSetup } from './runtime';

function createScenario() {
  const session = createSelectionModeSession();
  const sizePanel = document.createElement('div');
  const widthInput = document.createElement('input');
  const heightInput = document.createElement('input');
  const aspectRatioButton = document.createElement('button');
  const minusWidth = document.createElement('button');
  const plusHeight = document.createElement('button');
  minusWidth.className = 'sniptale-size-btn-minus';
  minusWidth.dataset['target'] = 'width';
  plusHeight.className = 'sniptale-size-btn-plus';
  plusHeight.dataset['target'] = 'height';
  sizePanel.append(minusWidth, plusHeight);
  Object.assign(session.dom, { aspectRatioButton, heightInput, sizePanel, widthInput });
  Object.assign(session, {
    aspectRatio: 2,
    currentSelection: { x: 100, y: 120, width: 300, height: 150 },
    maintainAspectRatio: true,
  });

  const constrainSelection = vi.fn();
  const getMaxSelectionHeight = vi.fn(() => 700);
  const getMaxSelectionWidth = vi.fn(() => 900);
  const updateFinalFrame = vi.fn();
  const setup = createSelectionModeSizePanelSetup({
    constrainSelection,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    session,
    updateFinalFrame,
  });

  return {
    aspectRatioButton,
    constrainSelection,
    getMaxSelectionHeight,
    getMaxSelectionWidth,
    heightInput,
    minusWidth,
    plusHeight,
    session,
    setup,
    updateFinalFrame,
    widthInput,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('selection-mode size-panel setup boundary', () => {
  it('does not resolve bounds or bind behavior when the size-panel DOM is incomplete', () => {
    const scenario = createScenario();
    scenario.session.dom.widthInput = null;

    scenario.setup();
    scenario.plusHeight.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(scenario.getMaxSelectionHeight).not.toHaveBeenCalled();
    expect(scenario.getMaxSelectionWidth).not.toHaveBeenCalled();
    expect(scenario.constrainSelection).not.toHaveBeenCalled();
    expect(scenario.updateFinalFrame).not.toHaveBeenCalled();
  });

  it('binds input commits directly to the single session authority and refresh lifecycle', () => {
    const scenario = createScenario();
    scenario.setup();

    scenario.widthInput.value = '420';
    scenario.widthInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(scenario.session.currentSelection).toEqual({
      x: 40,
      y: 90,
      width: 420,
      height: 210,
    });
    expect(scenario.heightInput.value).toBe('210');
    expect(scenario.constrainSelection).toHaveBeenCalledTimes(1);
    expect(scenario.updateFinalFrame).toHaveBeenCalledTimes(1);
  });

  it('routes adjustment buttons through the same selection update lifecycle', () => {
    const scenario = createScenario();
    scenario.setup();

    scenario.minusWidth.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    scenario.plusHeight.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(scenario.session.currentSelection).toEqual({
      x: 95,
      y: 117.5,
      width: 310,
      height: 155,
    });
    expect(scenario.constrainSelection).toHaveBeenCalledTimes(2);
    expect(scenario.updateFinalFrame).toHaveBeenCalledTimes(2);
  });

  it('toggles ratio state and snapshots the current ratio only when enabling', () => {
    const scenario = createScenario();
    scenario.session.maintainAspectRatio = false;
    scenario.session.aspectRatio = null;
    scenario.setup();

    scenario.aspectRatioButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );

    expect(scenario.session.maintainAspectRatio).toBe(true);
    expect(scenario.session.aspectRatio).toBe(2);
    expect(scenario.aspectRatioButton.getAttribute('aria-pressed')).toBe('true');
    expect(scenario.aspectRatioButton.classList).toContain('sniptale-glass-toolbar-button');
    expect(scenario.aspectRatioButton.classList).toContain('sniptale-glass-toolbar-button--active');
    expect(scenario.aspectRatioButton.style.getPropertyValue('background')).toBe('');
    expect(scenario.aspectRatioButton.style.width).toBe('30px');

    scenario.aspectRatioButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );

    expect(scenario.session.maintainAspectRatio).toBe(false);
    expect(scenario.session.aspectRatio).toBe(2);
    expect(scenario.aspectRatioButton.getAttribute('aria-pressed')).toBe('false');
    expect(scenario.aspectRatioButton.classList).not.toContain(
      'sniptale-glass-toolbar-button--active'
    );
    expect(scenario.aspectRatioButton.style.getPropertyValue('background')).toBe('');
  });
});
