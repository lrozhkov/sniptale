import { describe, expect, it } from 'vitest';
import {
  getControlIconButtonClassName,
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
  getControlSegmentedOptionClassName,
  getFormActionRowClassName,
  getFormPanelSurfaceClassName,
} from './index';

function expectMatteTextButtonFamily() {
  const primary = getControlPrimaryButtonClassName();
  const secondary = getControlSecondaryButtonClassName();

  expect(primary).toContain('h-10 min-h-10');
  expect(primary).toContain('cursor-pointer');
  expect(primary).toContain('rounded-[12px]');
  expect(primary).toContain('border-none');
  expect(primary).toContain('text-[12px] font-medium');
  expect(primary).toContain('var(--sniptale-color-accent-emphasis)');
  expect(secondary).toContain('h-10 min-h-10');
  expect(secondary).toContain('rounded-[12px]');
  expect(secondary).toContain('border-none');
  expect(secondary).toContain('var(--sniptale-color-surface-hover)_74%');
}

function expectMatteIconAndSegmentedControls() {
  const icon = getControlIconButtonClassName({ density: 'compact', tone: 'info' });
  const segmented = getControlSegmentedOptionClassName({
    active: true,
    density: 'default',
    layout: 'tile',
  });
  const segmentedIdle = getControlSegmentedOptionClassName({
    active: false,
    density: 'compact',
  });

  expect(icon).toContain('h-10 w-10');
  expect(icon).toContain('cursor-pointer');
  expect(icon).toContain('border-none');
  expect(icon).toContain('var(--sniptale-color-info)');
  expect(segmented).toContain('min-h-[88px]');
  expect(segmented).toContain('var(--sniptale-color-surface-hover)_82%');
  expect(segmented).toContain(
    'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]'
  );
  expect(segmentedIdle).toContain('hover:text-[var(--sniptale-color-text-primary-strong)]');
  expect(segmentedIdle).not.toContain(
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]'
  );
}

function expectMattePanelFamily() {
  const panel = getFormPanelSurfaceClassName();
  const row = getFormActionRowClassName({ emphasis: 'primary' });

  expect(panel).toContain('rounded-[20px]');
  expect(panel).toContain('var(--sniptale-color-surface-panel)_92%');
  expect(row).toContain('rounded-[16px]');
  expect(row).toContain('var(--sniptale-color-surface-panel)_82%');
}

function expectDangerPillAndActiveBranches() {
  const dangerSecondary = getControlSecondaryButtonClassName({
    density: 'compact',
    shape: 'pill',
    tone: 'danger',
  });
  const pillPrimary = getControlPrimaryButtonClassName({ shape: 'pill' });
  const activeIcon = getControlIconButtonClassName({ active: true });

  expect(dangerSecondary).toContain('rounded-full');
  expect(dangerSecondary).toContain('var(--sniptale-color-danger-soft)_34%');
  expect(pillPrimary).toContain('rounded-full');
  expect(pillPrimary).toContain('border-none');
  expect(activeIcon).toContain('var(--sniptale-color-surface-hover)_84%');
  expect(activeIcon).toContain('var(--sniptale-color-accent)_22%');
}

describe('controlLanguage', () => {
  it('keeps primary and secondary button roles on the same matte button family', () => {
    expectMatteTextButtonFamily();
  });

  it('keeps icon and segmented roles aligned with compact and default densities', () => {
    expectMatteIconAndSegmentedControls();
  });

  it('keeps form panels and rows on the same full-page matte family', () => {
    expectMattePanelFamily();
  });

  it('covers danger, pill, and active control branches without reintroducing filled idle states', () => {
    expectDangerPillAndActiveBranches();
  });
});
