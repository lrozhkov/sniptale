import { describe, expect, it } from 'vitest';
import {
  GLASS_SELECT_ANIMATION_CSS,
  getGlassSelectCheckClassName,
  getGlassSelectChevronClassName,
  getGlassSelectMenuClassName,
  getGlassSelectMenuSurfaceClassName,
  getGlassSelectTriggerClassName,
} from './styles';

function expectTriggerVariants() {
  const popupOpen = getGlassSelectTriggerClassName({
    disabled: false,
    isOpen: true,
    isPopupFlat: true,
    sizeClasses: 'h-11 px-3',
  });
  const popupDisabled = getGlassSelectTriggerClassName({
    disabled: true,
    isOpen: false,
    isPopupFlat: true,
    sizeClasses: 'h-10 px-2',
  });
  const panelOpen = getGlassSelectTriggerClassName({
    disabled: false,
    isOpen: true,
    isPopupFlat: false,
    sizeClasses: 'h-11 px-3',
  });

  expect(popupOpen).toContain('cursor-pointer');
  expect(popupOpen).toContain('border-[color:transparent]');
  expect(popupOpen).toContain('bg-[color:transparent]');
  expect(popupOpen).toContain(
    'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,var(--sniptale-color-border-soft)_82%)]'
  );
  expect(popupDisabled).toContain('cursor-not-allowed');
  expect(panelOpen).toContain('focus-visible:border-[var(--sniptale-color-border-accent-strong)]');
  expect(panelOpen).toContain('focus-visible:ring-2');
  expect(panelOpen).toContain('hover:bg-[linear-gradient(180deg,');
  expect(panelOpen).toContain('ring-2');
}

function expectSurfaceAndChevronStates() {
  expect(getGlassSelectMenuSurfaceClassName(true)).toContain('rounded-[12px]');
  expect(getGlassSelectMenuSurfaceClassName(false)).toContain('rounded-lg');
  expect(getGlassSelectChevronClassName(true)).toContain('rotate-180');
  expect(getGlassSelectChevronClassName(false)).not.toContain('rotate-180');
}

function expectMenuAndCheckVariants() {
  const popupSelected = getGlassSelectMenuClassName({
    isPopupFlat: true,
    isSelected: true,
    isDisabled: false,
    isFirst: true,
    isLast: false,
    size: 'sm',
  });
  const popupIdle = getGlassSelectMenuClassName({
    isPopupFlat: true,
    isSelected: false,
    isDisabled: false,
    isFirst: false,
    isLast: true,
    size: 'md',
  });
  const panelSelected = getGlassSelectMenuClassName({
    isPopupFlat: false,
    isSelected: true,
    isDisabled: false,
    isFirst: false,
    isLast: false,
    size: 'md',
  });
  const panelDisabled = getGlassSelectMenuClassName({
    isPopupFlat: false,
    isSelected: false,
    isDisabled: true,
    isFirst: false,
    isLast: true,
    size: 'sm',
  });

  expect(popupSelected).toContain('rounded-t-[11px]');
  expect(popupSelected).toContain('text-[var(--sniptale-color-text-primary-strong)]');
  expect(popupIdle).toContain('rounded-b-[11px]');
  expect(popupIdle).toContain('hover:text-[var(--sniptale-color-text-primary-strong)]');
  expect(panelSelected).toContain('bg-[var(--sniptale-color-accent-soft)]');
  expect(panelDisabled).toContain('cursor-not-allowed');
  expect(panelDisabled).toContain('rounded-b-md');
  expect(getGlassSelectCheckClassName(true)).toContain('text-[var(--sniptale-color-text-primary)]');
  expect(getGlassSelectCheckClassName(false)).toContain('text-[var(--sniptale-color-accent)]');
}

describe('glass select styles', () => {
  it('returns popup and panel trigger classes for the supported states', () => {
    expectTriggerVariants();
  });

  it('returns popup and panel menu surfaces plus chevron state', () => {
    expectSurfaceAndChevronStates();
  });

  it('returns the correct menu row and checkmark classes for popup and panel variants', () => {
    expectMenuAndCheckVariants();
  });

  it('exports the animation stylesheet used by the menu overlay', () => {
    expect(GLASS_SELECT_ANIMATION_CSS).toContain('@keyframes glassSelectIn');
    expect(GLASS_SELECT_ANIMATION_CSS).toContain('.animate-glassSelectIn');
  });
});
