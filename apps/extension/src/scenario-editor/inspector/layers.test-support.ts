import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';

export function createScenarioInspectorLayerElements() {
  return [
    { ...createScenarioArrowElement({ name: 'Arrow' }), id: 'arrow' },
    { ...createScenarioCalloutElement({ name: 'Callout' }), id: 'callout' },
    { ...createScenarioCodeElement({ name: 'Code' }), id: 'code' },
    { ...createScenarioImageElement({ name: 'Image' }), id: 'image' },
    { ...createScenarioLineElement({ name: 'Line' }), id: 'line' },
    { ...createScenarioShapeElement({ name: 'Shape' }), id: 'shape' },
    { ...createScenarioTextElement({ name: 'Text' }), id: 'text', locked: true, visible: false },
  ];
}
