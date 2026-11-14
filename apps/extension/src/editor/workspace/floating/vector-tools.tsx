import { useEffect, useRef, useState } from 'react';
import type { Group } from 'fabric';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { ContentToolbarButton, ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import { translate, useAppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import {
  useVectorStyleTransaction,
  type EditorVectorStyleTransaction,
} from './use-vector-style-transaction';
import { useEditorVectorSelection } from './vector-selection';
import { EditorVectorStyleProperties } from './vector-style-properties';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
function VectorReflectionActions({
  first,
  transaction,
  onBeforeApply,
}: {
  first: Group;
  transaction: EditorVectorStyleTransaction;
  onBeforeApply(): void;
}) {
  const controller = useEditorController();
  return (
    <>
      <ContentToolbarButton
        tone="property"
        className="!h-7 !min-h-7 !w-7 !min-w-7 !rounded !p-0"
        title={translate('editor.layerEffects.flipHorizontal')}
        aria-label={translate('editor.layerEffects.flipHorizontal')}
        dataUi="editor.vector.flip-horizontal"
        onClick={() => {
          onBeforeApply();
          if (first.sniptaleId)
            void controller
              .applyLayerTransformation(first.sniptaleId, 'flip-horizontal')
              .catch(transaction.fail);
        }}
      >
        <FlipHorizontal2 size={16} />
      </ContentToolbarButton>
      <ContentToolbarButton
        tone="property"
        className="!h-7 !min-h-7 !w-7 !min-w-7 !rounded !p-0"
        title={translate('editor.layerEffects.flipVertical')}
        aria-label={translate('editor.layerEffects.flipVertical')}
        dataUi="editor.vector.flip-vertical"
        onClick={() => {
          onBeforeApply();
          if (first.sniptaleId)
            void controller
              .applyLayerTransformation(first.sniptaleId, 'flip-vertical')
              .catch(transaction.fail);
        }}
      >
        <FlipVertical2 size={16} />
      </ContentToolbarButton>
    </>
  );
}

/** Inline fields and color pickers share one accepted vector styling transaction. */
export function EditorVectorProperties() {
  useAppLocale();
  const {
    controller,
    objects,
    first,
    definition,
    selectionKey,
    historyIndex,
    same,
    opacity,
    strokeScale,
  } = useEditorVectorSelection();
  const transaction = useVectorStyleTransaction();
  const rootRef = useRef<HTMLDivElement>(null);
  const cancel = useRef(transaction.cancel);
  cancel.current = transaction.cancel;
  const [paletteKey, setPaletteKey] = useState(0);
  useEffect(() => {
    cancel.current();
    setPaletteKey((value) => value + 1);
    return () => cancel.current();
  }, [controller, selectionKey, historyIndex]);
  if (!first || !definition) return null;
  const closeProperties = () => {
    transaction.cancel();
    setPaletteKey((value) => value + 1);
  };
  return (
    <div
      ref={rootRef}
      className="flex min-w-0 items-center gap-1"
      data-ui="editor.vector.properties"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') transaction.cancel();
      }}
    >
      <EditorVectorStyleProperties
        first={first}
        definition={definition}
        same={same}
        opacity={transaction.draft.opacity ?? opacity}
        strokeScale={transaction.draft.strokeScale ?? strokeScale}
        transaction={transaction}
        paletteKey={paletteKey}
        onColorOpen={transaction.cancel}
        onNumberFocus={closeProperties}
      />
      {objects.length === 1 || same ? <ContentToolbarDivider className="!my-0 !h-5" /> : null}
      {objects.length === 1 ? (
        <VectorReflectionActions
          first={first}
          transaction={transaction}
          onBeforeApply={closeProperties}
        />
      ) : null}
      {transaction.error ? (
        <span role="alert" className="max-w-48 text-xs text-[var(--sniptale-color-danger)]">
          {message('operationFailed')}
        </span>
      ) : null}
    </div>
  );
}
