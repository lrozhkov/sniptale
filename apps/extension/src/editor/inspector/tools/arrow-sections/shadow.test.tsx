import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sections')>()),
  CollapsibleSection: (props: React.PropsWithChildren<{ label: string }>) => (
    <section data-label={props.label}>{props.children}</section>
  ),
}));

vi.mock('../color-section', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../color-section')>()),
  ToolColorSection: (props: {
    applyPatch: (patch: { shadowColor: string }) => void;
    createPatch: (color: string) => { shadowColor: string };
    value: string;
  }) => (
    <button
      type="button"
      data-value={props.value}
      onClick={() => props.applyPatch(props.createPatch('#123456'))}
    />
  ),
}));

vi.mock('../shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shadow')>()),
  ShadowAngleSection: (props: { onChange: (value: number) => void; value: number }) => (
    <button type="button" data-value={props.value} onClick={() => props.onChange(135)} />
  ),
  ShadowBlurSection: (props: { onChange: (value: number) => void; value: number }) => (
    <button type="button" data-value={props.value} onClick={() => props.onChange(16)} />
  ),
  ShadowDistanceSection: (props: { onChange: (value: number) => void; value: number }) => (
    <button type="button" data-value={props.value} onClick={() => props.onChange(8)} />
  ),
  ShadowRangeSection: (props: { label: string; onChange: (value: number) => void }) => (
    <button type="button" data-label={props.label} onClick={() => props.onChange(40)} />
  ),
}));

import { renderArrowShadowSection } from './shadow';

function createProps() {
  return {
    applyArrowPatch: vi.fn(),
    commitPendingSelectionSettings: vi.fn(),
    previewArrowPatch: vi.fn(),
    previewColor: vi.fn(),
    recentColors: [],
    shapeStrokePalette: [],
    updateColor: vi.fn(),
  };
}

describe('renderArrowShadowSection', () => {
  it('uses canonical shadow fallbacks and routes shadow patches', () => {
    const props = createProps();
    const section = renderArrowShadowSection(
      props as never,
      {
        color: '#f97316',
        shadow: 20,
      } as never
    );
    const controls = React.Children.toArray(
      section.props.children.props.children
    ) as React.ReactElement<any>[];

    expect(controls[1]?.props.value).toBe('#f97316');
    expect(controls[2]?.props.value).toBe(90);
    expect(controls[3]?.props.value).toBe(4);
    expect(controls[4]?.props.value).toBe(12);

    controls[0]?.props.onChange(40);
    controls[1]?.props.applyPatch(controls[1]?.props.createPatch('#123456'));
    controls[2]?.props.onChange(135);
    controls[3]?.props.onChange(8);
    controls[4]?.props.onChange(16);

    expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadow: 40 });
    expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadowAngle: 135 });
    expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadowDistance: 8 });
    expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadowBlur: 16 });
    expect(props.applyArrowPatch).toHaveBeenCalledWith({ shadowColor: '#123456' });
  });
});
