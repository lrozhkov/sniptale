import {
  resolveDrawingTextFontFamily,
  type DrawingFontFamily,
  type DrawingTextBackgroundRect,
  type DrawingTextInkLayout,
} from '../../features/drawing/public';

/** Glyph-mask geometry comes from the same layout as the visible text and backgrounds. */
export type DrawingTextStencilSource = {
  fontFamily: DrawingFontFamily;
  fontSize: number;
  layout: DrawingTextInkLayout;
};

export function DrawingTextStencilMask(props: {
  id: string;
  source: DrawingTextStencilSource;
  rects: readonly DrawingTextBackgroundRect[];
}) {
  const { source, rects } = props;
  const left = Math.min(0, ...rects.map((rect) => rect.left)) - 1;
  const top = Math.min(0, ...rects.map((rect) => rect.top)) - 1;
  const width = Math.max(0, ...rects.map((rect) => rect.left + rect.width)) - left + 1;
  const height = Math.max(0, ...rects.map((rect) => rect.top + rect.height)) - top + 1;
  return (
    <mask id={props.id} maskUnits="userSpaceOnUse" x={left} y={top} width={width} height={height}>
      <rect x={left} y={top} width={width} height={height} fill="#ffffff" />
      {source.layout.lines.map((text, index) => (
        <text
          key={index}
          x={source.layout.originX}
          y={source.layout.firstBaseline + index * source.layout.lineHeight}
          fill="#000000"
          xmlSpace="preserve"
          style={{
            fontFamily: resolveDrawingTextFontFamily(source.fontFamily),
            fontSize: source.fontSize,
            fontWeight: 400,
            fontStyle: 'normal',
            whiteSpace: 'pre',
          }}
        >
          {text}
        </text>
      ))}
    </mask>
  );
}
