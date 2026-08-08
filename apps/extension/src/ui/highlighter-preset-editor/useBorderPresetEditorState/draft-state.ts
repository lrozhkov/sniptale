import { useMemo, useState } from 'react';

import type { BorderPresetDraftSetters, BorderPresetDraftState } from './types';
import { cloneBorderPresetEffects } from '@sniptale/runtime-contracts/highlighter/border-preset';

export function useBorderPresetDraftState() {
  const [name, setName] = useState('');
  const [width, setWidth] = useState(3);
  const [color, setColor] = useState('#f97316');
  const [style, setStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [radius, setRadius] = useState(0);
  const [padding, setPadding] = useState({ top: 3, left: 3, right: 3, bottom: 3 });
  const [shadow, setShadow] = useState(0);
  const [fillColor, setFillColor] = useState('#00000000');
  const [effects, setEffects] = useState(() => cloneBorderPresetEffects(undefined));
  const [inheritCustomCss, setInheritCustomCss] = useState(false);
  const [customCss, setCustomCss] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(72);
  const [isResizing, setIsResizing] = useState(false);
  const setters = useMemo<BorderPresetDraftSetters>(
    () => ({
      setColor,
      setCustomCss,
      setFillColor,
      setEffects,
      setInheritCustomCss,
      setIsResizing,
      setName,
      setPadding,
      setRadius,
      setShadow,
      setStyle,
      setTextareaHeight,
      setWidth,
    }),
    []
  );
  const draft: BorderPresetDraftState = {
    color,
    customCss,
    fillColor,
    effects,
    inheritCustomCss,
    isResizing,
    name,
    padding,
    radius,
    shadow,
    style,
    textareaHeight,
    width,
    ...setters,
  };

  return { draft, setters };
}
