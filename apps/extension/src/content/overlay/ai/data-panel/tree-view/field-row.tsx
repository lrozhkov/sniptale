import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TreeNodeState } from '../types';

type FieldRowProps = {
  field: FieldNode;
  state: TreeNodeState;
  toggleSelected: (nodeId: string) => void;
};

export function FieldRow({ field, state, toggleSelected }: FieldRowProps) {
  return (
    <div
      className={[
        'sniptale-tree-row sniptale-tree-row-field',
        state.selected && 'sniptale-tree-row-field-selected',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="checkbox"
        className="sniptale-checkbox"
        checked={state.selected}
        onChange={() => toggleSelected(field.id)}
        style={{ marginTop: '2px' }}
      />
      <div style={{ flex: 1 }}>
        <div className="sniptale-ai-field-row">
          <span className="sniptale-ai-field-label">{field.label}:</span>{' '}
          <span className="sniptale-ai-field-value">{field.value}</span>
        </div>
      </div>
    </div>
  );
}
