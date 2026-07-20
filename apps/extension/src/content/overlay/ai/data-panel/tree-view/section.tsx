import { translate } from '../../../../../platform/i18n';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { getDefaultTreeNodeState } from '../tree/helpers';
import type { TreeRenderProps } from '../tree/types';
import { TreeSectionChildren } from './section-children';
import { ExpandIcon } from './tree-icons';

export function TreeSection({
  section,
  treeRenderProps,
}: {
  section: SectionNode;
  treeRenderProps: TreeRenderProps;
}) {
  const state = getDefaultTreeNodeState(section.id, true, treeRenderProps);
  const rowClasses = ['sniptale-tree-row', state.selected && 'sniptale-tree-row-selected']
    .filter(Boolean)
    .join(' ');

  return (
    <div style={{ marginBottom: '8px' }}>
      <div className={rowClasses}>
        <input
          type="checkbox"
          className="sniptale-checkbox"
          checked={state.selected}
          onChange={() => treeRenderProps.toggleSelected(section.id)}
          onClick={(event) => event.stopPropagation()}
        />
        <button
          className="sniptale-expand-btn"
          onClick={() => treeRenderProps.toggleExpanded(section.id)}
          title={
            state.expanded ? translate('aiModal.collapseTitle') : translate('aiModal.expandTitle')
          }
        >
          <ExpandIcon expanded={state.expanded} size={12} />
        </button>
        <span
          className="sniptale-ai-section-title"
          onClick={() => treeRenderProps.toggleExpanded(section.id)}
        >
          {section.title}
        </span>
      </div>
      {state.expanded ? (
        <TreeSectionChildren section={section} treeRenderProps={treeRenderProps} />
      ) : null}
    </div>
  );
}
