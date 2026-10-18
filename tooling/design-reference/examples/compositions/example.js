import { el, exampleCase } from '../shared/dom.js';
import { SceneComposition } from './scene.js';
import { AppearanceComposition } from './appearance.js';
import { PresentationComposition } from './presentation.js';
import { GalleryComposition } from './gallery.js';
import { SettingsComposition } from './settings.js';
import { CaptureComposition } from './capture.js';
import { InspectorPresentationComposition } from './inspector-presentation.js';
import { ResourceComposition } from './resources.js';
import { BrowserHeaderComposition } from './browser-header.js';
import { RecordingSettingsComposition } from './recording-settings.js';
import { NestedMediaComposition } from './nested-media.js';
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
