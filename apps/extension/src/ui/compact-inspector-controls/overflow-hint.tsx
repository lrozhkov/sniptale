import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ProductGlassPresetName } from '@sniptale/ui/product-glass-controls';

function useOverflowTitle<TElement extends HTMLElement>(text: string) {
  const ref = useRef<TElement>(null);
  const [isClipped, setIsClipped] = useState(false);
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    setIsClipped(element.scrollWidth > element.clientWidth);
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, text]);

  return { ref, title: isClipped ? text : undefined };
}

export function PresetNameWithOverflowHint({ name }: { name: string }) {
  const overflow = useOverflowTitle<HTMLSpanElement>(name);
  return (
    <ProductGlassPresetName ref={overflow.ref} title={overflow.title}>
      {name}
    </ProductGlassPresetName>
  );
}

export function TextWithOverflowHint(props: { className?: string; text: string }) {
  const overflow = useOverflowTitle<HTMLSpanElement>(props.text);
  return (
    <span className={props.className} ref={overflow.ref} title={overflow.title}>
      {props.text}
    </span>
  );
}
