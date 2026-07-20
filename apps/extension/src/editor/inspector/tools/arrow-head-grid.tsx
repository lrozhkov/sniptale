import type { EditorArrowHead } from '../../../features/editor/document/types';
import { buildArrowHeadPath, getArrowHeadAttachmentInset } from '../../objects/arrow/visual/heads';
import { PreviewTileGrid, type CompactSelectOption } from '../../chrome/ui';

const ARROW_HEAD_PREVIEW_STROKE_WIDTH = 4;
const ARROW_HEAD_PREVIEW_POINT = { x: 56, y: 24 };

export function renderArrowHeadPreview(type: EditorArrowHead) {
  const attachmentInset = getArrowHeadAttachmentInset(type, ARROW_HEAD_PREVIEW_STROKE_WIDTH);
  const lineEnd = type === 'none' ? 62 : Math.max(26, ARROW_HEAD_PREVIEW_POINT.x - attachmentInset);
  const headPath = buildArrowHeadPath(
    type,
    ARROW_HEAD_PREVIEW_POINT,
    0,
    ARROW_HEAD_PREVIEW_STROKE_WIDTH
  );

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 72 48"
      className="h-7 w-full"
      data-arrow-head-preview={type}
    >
      <path
        d={`M 12 24 L ${lineEnd} 24`}
        fill="none"
        stroke="currentColor"
        strokeWidth={ARROW_HEAD_PREVIEW_STROKE_WIDTH}
        strokeLinecap="round"
      />
      {headPath ? (
        <path
          d={headPath}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

export function ArrowHeadPreviewGrid(props: {
  ariaLabel: string;
  onChange: (value: EditorArrowHead) => void;
  options: readonly CompactSelectOption<EditorArrowHead>[];
  value: EditorArrowHead;
}) {
  return (
    <PreviewTileGrid
      ariaLabel={props.ariaLabel}
      columns={2}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
      renderPreview={(option) => renderArrowHeadPreview(option.value)}
      showLabel
      tileClassName="min-h-[3.75rem] rounded-[7px] px-2 py-1.5"
    />
  );
}
