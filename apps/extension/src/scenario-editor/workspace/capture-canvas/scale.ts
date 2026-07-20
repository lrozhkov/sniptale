import { useEffect, useRef, useState } from 'react';
import { SCENARIO_STAGE_WIDTH } from '../../../features/scenario/stage/layout';

export function useScenarioWorkspaceStageScale() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const updateScale = () => {
      const nextScale = Math.min(1, node.clientWidth / SCENARIO_STAGE_WIDTH);
      setScale(nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return {
    containerRef,
    scale,
  };
}
