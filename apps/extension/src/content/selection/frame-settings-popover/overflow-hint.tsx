import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ProductGlassPresetName } from '@sniptale/ui/product-glass-controls';

export function FramePresetName({ name }: { name: string }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [isClipped, setIsClipped] = useState(false);
  const measure = useCallback(() => {
    const element = nameRef.current;
    if (!element) return;
    setIsClipped(element.scrollWidth > element.clientWidth);
  }, []);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, name]);

  return (
    <ProductGlassPresetName ref={nameRef} title={isClipped ? name : undefined}>
      {name}
    </ProductGlassPresetName>
  );
}
