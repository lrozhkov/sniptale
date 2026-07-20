import { useState } from 'react';

import type { BorderPresetDraftState } from './types';

export function useBorderPresetDraftValues(): BorderPresetDraftState {
  const [name, setName] = useState('');
  const [width, setWidth] = useState(3);
  const [color, setColor] = useState('#f97316');
  const [style, setStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [radius, setRadius] = useState(0);
  const [padding, setPadding] = useState({ top: 3, left: 3, right: 3, bottom: 3 });
  const [shadow, setShadow] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [strokeOpacity, setStrokeOpacity] = useState(100);
  const [fillColor, setFillColor] = useState('#00000000');
  const [fillOpacity, setFillOpacity] = useState(0);
  const [inheritCustomCss, setInheritCustomCss] = useState(false);
  const [customCss, setCustomCss] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(72);
  const [isResizing, setIsResizing] = useState(false);

  return {
    color,
    customCss,
    fillColor,
    fillOpacity,
    inheritCustomCss,
    isResizing,
    name,
    opacity,
    padding,
    radius,
    setColor,
    setCustomCss,
    setFillColor,
    setFillOpacity,
    setInheritCustomCss,
    setIsResizing,
    setName,
    setOpacity,
    setPadding,
    setRadius,
    setShadow,
    setStyle,
    setTextareaHeight,
    setStrokeOpacity,
    setWidth,
    shadow,
    strokeOpacity,
    style,
    textareaHeight,
    width,
  };
}
