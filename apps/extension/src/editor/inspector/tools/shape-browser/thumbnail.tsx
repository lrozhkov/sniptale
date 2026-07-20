import {
  isValidEditorBuiltInShapeGeometry,
  type EditorBuiltInShapeGeometryDefinition,
  type EditorBuiltInShapePathCommand,
} from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function pathCommandToData(command: EditorBuiltInShapePathCommand): string {
  switch (command[0]) {
    case 'M':
    case 'L':
      return `${command[0]} ${formatNumber(command[1])} ${formatNumber(command[2])}`;
    case 'Q':
      return (
        `Q ${formatNumber(command[1])} ${formatNumber(command[2])} ` +
        `${formatNumber(command[3])} ${formatNumber(command[4])}`
      );
    case 'C':
      return (
        `C ${formatNumber(command[1])} ${formatNumber(command[2])} ` +
        `${formatNumber(command[3])} ${formatNumber(command[4])} ` +
        `${formatNumber(command[5])} ${formatNumber(command[6])}`
      );
    case 'A':
      return (
        `A ${formatNumber(command[1])} ${formatNumber(command[2])} ` +
        `${formatNumber(command[3])} ${command[4]} ${command[5]} ` +
        `${formatNumber(command[6])} ${formatNumber(command[7])}`
      );
    case 'Z':
      return 'Z';
  }
}

function renderPathGeometry(geometry: EditorBuiltInShapeGeometryDefinition) {
  if (geometry.type !== 'path') {
    return null;
  }

  return geometry.paths.map((path, index) => (
    <path
      key={index}
      d={path.commands.map(pathCommandToData).join(' ')}
      fill="none"
      fillRule={path.fillRule}
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
    />
  ));
}

function renderPolylineGeometry(geometry: EditorBuiltInShapeGeometryDefinition) {
  if (geometry.type !== 'polyline') {
    return null;
  }

  const points = geometry.points.map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`).join(' ');
  const PolylineElement = geometry.closed ? 'polygon' : 'polyline';

  return (
    <PolylineElement
      points={points}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="4"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function ShapeThumbnailFallback() {
  return (
    <svg
      aria-label={translate('editor.shapeCatalog.browser.unsupportedThumbnail')}
      role="img"
      viewBox="0 0 64 48"
      className="h-12 w-full"
      data-shape-thumbnail-fallback="true"
    >
      <rect x="12" y="8" width="40" height="32" rx="4" fill="none" stroke="currentColor" />
      <path d="M 16 36 L 48 12" fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function ShapeThumbnail(props: { geometry: EditorBuiltInShapeGeometryDefinition | null }) {
  const geometry = props.geometry;
  if (!geometry || !isValidEditorBuiltInShapeGeometry(geometry)) {
    return <ShapeThumbnailFallback />;
  }

  const { minX, minY, width, height } = geometry.viewBox;

  return (
    <svg
      aria-hidden="true"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-12 w-full"
      data-shape-thumbnail="true"
    >
      {renderPathGeometry(geometry)}
      {renderPolylineGeometry(geometry)}
    </svg>
  );
}
