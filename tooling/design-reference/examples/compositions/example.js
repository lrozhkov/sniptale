import { el, exampleCase } from '../shared/dom.js';
import {
  SceneComposition,
  AppearanceComposition,
  PresentationComposition,
  GalleryComposition,
  SettingsComposition,
  CaptureComposition,
  InspectorPresentationComposition,
  ResourceComposition,
  BrowserHeaderComposition,
  RecordingSettingsComposition,
  NestedMediaComposition,
} from '../shared/compositions.js';
export function render(root, { manifest, theme }) {
  for (const [key, build] of [
    ['scene', SceneComposition],
    ['appearance', AppearanceComposition],
    ['presentation', PresentationComposition],
    ['gallery', GalleryComposition],
    ['settings', SettingsComposition],
    ['capture', CaptureComposition],
    ['inspector-presentation', InspectorPresentationComposition],
    ['resource', ResourceComposition],
    ['browser-header', BrowserHeaderComposition],
    ['recording-settings', RecordingSettingsComposition],
    ['nested-media', NestedMediaComposition],
  ]) {
    const stage = el('div', { class: 'case-stage composition-stage' });
    root.append(
      exampleCase(
        manifest.cases.find((c) => c.id === 'compositions.' + key),
        [stage]
      )
    );
    build(stage, { theme });
  }
}
