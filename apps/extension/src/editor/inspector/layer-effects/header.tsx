import { SearchField } from '../../chrome/ui';
import { isLayerEffectSearchable, translateLayerEffects } from './helpers';
import type { EditorInspectorLayerEffectsProps } from './types';

function LayerEffectsSearch(props: { query: string; onChange: (query: string) => void }) {
  return (
    <SearchField
      label={translateLayerEffects('editor.toolbar.layerEffectsSearchPlaceholder')}
      value={props.query}
      onChange={props.onChange}
      placeholder={translateLayerEffects('editor.toolbar.layerEffectsSearchPlaceholder')}
    />
  );
}

export function LayerEffectsHeader(props: {
  category: EditorInspectorLayerEffectsProps['layerEffectsState']['category'];
  query: string;
  setQuery: (query: string) => void;
}) {
  if (!isLayerEffectSearchable(props.category)) {
    return null;
  }

  return (
    <div className="min-w-0">
      <LayerEffectsSearch query={props.query} onChange={props.setQuery} />
    </div>
  );
}
