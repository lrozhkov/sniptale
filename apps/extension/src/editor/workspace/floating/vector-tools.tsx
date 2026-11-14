import { useEffect, useRef, useState } from 'react';
import type { Group } from 'fabric';
import { FlipHorizontal2, FlipVertical2, RotateCcw } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate, useAppLocale } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import {
  useVectorStyleTransaction,
  type EditorVectorStyleTransaction,
} from './use-vector-style-transaction';
import { useEditorVectorSelection } from './vector-selection';
import { EditorVectorStyleProperties } from './vector-style-properties';
import { useEditorVectorPresets, EditorVectorPresetControls } from './vector-presets';
const message = (
  key: keyof (typeof import('../../../platform/i18n/catalogs/en.json'))['editor']['elements']
) => translate(`editor.elements.${key}`);
function VectorReflectionActions({
  first,
  transaction,
}: {
  first: Group;
  transaction: EditorVectorStyleTransaction;
}) {
  const controller = useEditorController();
  return (
    <>
      <ContentToolbarButton
        tone="property"
        title={translate('editor.layerEffects.flipHorizontal')}
        aria-label={translate('editor.layerEffects.flipHorizontal')}
        dataUi="editor.vector.flip-horizontal"
        onClick={() => {
          transaction.cancel();
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
        title={translate('editor.layerEffects.flipVertical')}
        aria-label={translate('editor.layerEffects.flipVertical')}
        dataUi="editor.vector.flip-vertical"
        onClick={() => {
          transaction.cancel();
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

/** One disclosure lifetime owns accepted vector styling commands and picker cancellation. */
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
  const presets = useEditorVectorPresets(first, definition, same, selectionKey, transaction);
  const rootRef = useRef<HTMLDivElement>(null);
  const cancel = useRef(transaction.cancel);
  cancel.current = transaction.cancel;
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    cancel.current();
    setActive(null);
    return () => cancel.current();
  }, [controller, selectionKey, historyIndex]);
  useEffect(() => {
    if (!active) return;
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      const element = target instanceof Element ? target : target.parentElement;
      if (element?.closest('[data-floating-ui-root="true"]')) return;
      cancel.current();
      setActive(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel.current();
        setActive(null);
        rootRef.current
          ?.querySelector<HTMLElement>(
            `[data-ui="editor.floating.tool-properties.group.${active}"]`
          )
          ?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [active]);
  if (!first || !definition) return null;
  const toggle = (id: string) => {
    transaction.cancel();
    setActive((current) => (current === id ? null : id));
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
        active={active}
        toggle={toggle}
        transaction={transaction}
      />
      {objects.length === 1 ? (
        <VectorReflectionActions first={first} transaction={transaction} />
      ) : null}
      {same ? (
        <ContentToolbarButton
          tone="property"
          title={message('reset')}
          aria-label={message('reset')}
          dataUi="editor.vector.reset"
          onClick={() => void transaction.commit({ reset: true })}
        >
          <RotateCcw size={16} />
        </ContentToolbarButton>
      ) : null}
      {same ? <EditorVectorPresetControls model={presets} active={active} toggle={toggle} /> : null}
      {transaction.error ? (
        <span role="alert" className="max-w-48 text-xs text-[var(--sniptale-color-danger)]">
          {message('operationFailed')}
        </span>
      ) : null}
    </div>
  );
}
