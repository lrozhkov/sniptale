// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  EFFECT_V1_CONTROL_ICONS,
  EFFECT_V1_CONTROL_GROUPS,
  EFFECT_V1_CONTROL_ROOT_ICONS,
} from '@sniptale/runtime-contracts/effect-v1';
import { effectControlIcons, effectControlRootIcon } from './icons';

it('renders all 57 semantic icons with distinct glyphs and contract-owned root reservations', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        <>
          {EFFECT_V1_CONTROL_ICONS.map((id) => {
            const Icon = effectControlIcons[id];
            return <Icon key={id} size={16} />;
          })}
        </>
      )
    );
    const glyphs = [...host.querySelectorAll('svg')].map((node) => node.innerHTML);
    expect(glyphs).toHaveLength(57);
    expect(new Set(glyphs).size).toBe(57);
    for (const group of EFFECT_V1_CONTROL_GROUPS)
      expect(effectControlRootIcon(group)).toBe(
        effectControlIcons[EFFECT_V1_CONTROL_ROOT_ICONS[group]]
      );
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
