import { useMemo, type CSSProperties } from 'react';
import { hexToRgba } from '../../document/model';

export function useCanvasGridStyle(props: {
  gridEnabled: boolean;
  zoomPercent: number;
  gridSize: number;
  gridColor: string;
}) {
  return useMemo<CSSProperties | null>(() => {
    if (!props.gridEnabled) {
      return null;
    }

    const zoomFactor = Math.max(props.zoomPercent / 100, 0.2);
    const rawCellSize = props.gridSize * zoomFactor;
    const densityStep =
      rawCellSize >= 14 ? 1 : Math.max(1, Math.ceil(14 / Math.max(rawCellSize, 1)));
    const renderedCellSize = Math.max(10, Math.round(rawCellSize * densityStep * 100) / 100);
    const lineOpacity = rawCellSize >= 22 ? 0.34 : rawCellSize >= 12 ? 0.2 : 0.12;
    const lineColor = hexToRgba(props.gridColor, lineOpacity);

    return {
      backgroundImage:
        `linear-gradient(${lineColor} 1px, transparent 1px), ` +
        `linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: `${renderedCellSize}px ${renderedCellSize}px`,
      backgroundPosition: '-0.5px -0.5px',
    };
  }, [props.gridColor, props.gridEnabled, props.gridSize, props.zoomPercent]);
}
