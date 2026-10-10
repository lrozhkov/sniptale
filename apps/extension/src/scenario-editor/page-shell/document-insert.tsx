import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';
import {
  FileText,
  Heading,
  Image,
  ListPlus,
  MessageSquare,
  CornerDownLeft,
  Ellipsis,
} from 'lucide-react';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import { GuideInsertActions } from './insert-actions';

const InsertionAvailability = createContext<{ blocked: boolean; breaks: readonly string[] }>({
  blocked: false,
  breaks: [],
});
/** Editor selection and measured rows jointly determine available insertion commands. */
export function GuideInsertScope({
  value,
  breaks = [],
  children,
}: {
  value: boolean;
  breaks?: readonly string[];
  children: ReactNode;
}) {
  const availability = useMemo(() => ({ blocked: value, breaks }), [value, breaks]);
  return <InsertionAvailability value={availability}>{children}</InsertionAvailability>;
}

type InsertTarget =
  | { kind: 'item'; beforeItemId?: string }
  | { kind: 'block'; itemId: string; beforeBlockId?: string };

type GuideDocumentInsertProps = {
  target: InsertTarget;
  end?: boolean;
  rowStart?: boolean;
  disabled: boolean;
  onOperate: (operation: GuideStructureOperation) => void;
  t: Translate;
};

type InsertViewTarget =
  | { kind: 'item'; itemId: undefined; before: string | undefined }
  | { kind: 'block'; itemId: string; before: string | undefined };

const itemInsertions = [
  { kind: 'add-step', label: 'scenario.editor.guideAddStep', Icon: ListPlus },
  { kind: 'add-section', label: 'scenario.editor.guideAddSection', Icon: Heading },
] as const;
const blockInsertions = [
  { kind: 'image-slot', label: 'scenario.editor.guideAddImage', Icon: Image },
  { kind: 'text', label: 'scenario.editor.guideAddText', Icon: FileText },
  { kind: 'heading', label: 'scenario.editor.guideAddHeading', Icon: Heading },
  { kind: 'note', label: 'scenario.editor.guideAddNote', Icon: MessageSquare },
] as const;

/** A boundary command uses stable document identities and the existing mutation owner. */
export function GuideDocumentInsert({ target, ...props }: GuideDocumentInsertProps) {
  const identities: InsertViewTarget =
    target.kind === 'item'
      ? { kind: target.kind, itemId: undefined, before: target.beforeItemId }
      : { kind: target.kind, itemId: target.itemId, before: target.beforeBlockId };
  return <GuideInsertionView {...props} {...identities} />;
}

const GuideInsertionView = memo(function GuideInsertionView({
  kind,
  itemId,
  before,
  end = false,
  rowStart,
  disabled,
  onOperate,
  t,
}: Omit<GuideDocumentInsertProps, 'target'> & InsertViewTarget) {
  const { blocked, breaks } = useContext(InsertionAvailability);
  const items =
    kind === 'item'
      ? itemInsertions.map(({ kind: operation, label, Icon }) => ({
          label: t(label),
          icon: <Icon size={15} aria-hidden="true" />,
          onSelect: () =>
            onOperate({
              kind: operation,
              ...(before === undefined ? {} : { beforeItemId: before }),
            }),
        }))
      : blockInsertions.map(({ kind: blockKind, label, Icon }) => ({
          label: t(label),
          icon: <Icon size={15} aria-hidden="true" />,
          onSelect: () =>
            onOperate({
              kind: 'add-block',
              itemId,
              blockKind,
              ...(before === undefined ? {} : { beforeBlockId: before }),
            }),
        }));
  const rowStartItem =
    kind === 'block' && before && rowStart !== undefined && breaks.includes(before)
      ? {
          label: t(
            rowStart ? 'scenario.editor.guideRemoveRowStart' : 'scenario.editor.guideRowStart'
          ),
          icon: <CornerDownLeft size={15} aria-hidden="true" />,
          pressed: rowStart,
          onSelect: () =>
            onOperate({
              kind: 'set-row-start',
              itemId,
              blockId: before,
              rowStart: !rowStart,
            }),
        }
      : null;
  return (
    <div
      className={`guide-insertion guide-insertion-${kind}`}
      data-end={end}
      data-blocked={blocked || undefined}
      inert={blocked}
      aria-hidden={blocked || undefined}
      data-insert-before={before ?? 'end'}
    >
      <div className="guide-insertion-chrome">
        <GuideInsertActions
          icon={<Ellipsis size={16} aria-hidden="true" />}
          label={t(
            kind === 'item' ? 'scenario.editor.guideInsertItem' : 'scenario.editor.guideAddBlock'
          )}
          items={rowStartItem ? [...items, rowStartItem] : items}
          disabled={disabled || blocked}
        />
      </div>
    </div>
  );
});
