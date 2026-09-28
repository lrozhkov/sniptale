import type { ContentDrawingController } from '../../../drawing/controller';
import type {
  DrawingSessionSnapshot,
  DrawingToolDefaults,
} from '../../../../features/drawing/public';
import {
  resolveUpdatedQuickObject,
  type DrawingQuickToolUpdate as QuickToolUpdate,
  type SelectedQuickDrawingObject,
} from '../../../../features/drawing/updates';
import { measureContentDrawingText } from '../../../drawing/text-measurement';

export type ConfigurableDrawingQuickOptionsTool = 'pencil' | 'marker' | 'shape' | 'arrow' | 'text';

function resolveQuickToolDefaults(
  defaults: DrawingToolDefaults,
  tool: ConfigurableDrawingQuickOptionsTool,
  update: QuickToolUpdate
): DrawingToolDefaults {
  switch (tool) {
    case 'pencil':
      return { ...defaults, pencil: { ...defaults.pencil, ...update } };
    case 'marker':
      return { ...defaults, marker: { ...defaults.marker, ...update } };
    case 'shape':
      return { ...defaults, shape: { ...defaults.shape, ...update } };
    case 'arrow':
      return {
        ...defaults,
        arrow: {
          ...defaults.arrow,
          color: update.color ?? defaults.arrow.color,
          design: update.design ?? defaults.arrow.design,
          drawFromTip: defaults.arrow.drawFromTip,
          dynamicWidth: update.dynamicWidth ?? defaults.arrow.dynamicWidth,
          width: update.width ?? defaults.arrow.width,
        },
      };
    case 'text':
      return {
        ...defaults,
        text: {
          ...defaults.text,
          backgroundColor:
            update.backgroundColor === undefined
              ? defaults.text.backgroundColor
              : update.backgroundColor,
          color: update.color ?? defaults.text.color,
          fontFamily: update.fontFamily ?? defaults.text.fontFamily,
          fontSize: update.fontSize ?? defaults.text.fontSize,
        },
      };
  }
}

export function updateQuickToolOption(args: {
  controller: ContentDrawingController;
  selected: SelectedQuickDrawingObject;
  snapshot: DrawingSessionSnapshot;
  tool: ConfigurableDrawingQuickOptionsTool;
  update: QuickToolUpdate;
}) {
  const { controller, selected, snapshot, tool, update } = args;
  controller.session.setDefaults(resolveQuickToolDefaults(snapshot.defaults, tool, update));
  if (selected) {
    controller.session.replaceObject(
      resolveUpdatedQuickObject(selected, update, { measureText: measureContentDrawingText })
    );
  }
}

export function changeSelectedQuickObjects(args: {
  controller: ContentDrawingController;
  selected: readonly Exclude<SelectedQuickDrawingObject, null>[];
  update: QuickToolUpdate;
  preview: boolean;
}) {
  const replacements = args.selected.map((object) =>
    resolveUpdatedQuickObject(object, args.update, { measureText: measureContentDrawingText })
  );
  if (args.preview) args.controller.session.previewObjects(replacements);
  else args.controller.session.replaceObjects(replacements);
}

export function previewSelectedQuickObject(
  controller: ContentDrawingController,
  selected: Exclude<SelectedQuickDrawingObject, null>,
  update: QuickToolUpdate
) {
  controller.session.previewObjects([
    resolveUpdatedQuickObject(selected, update, { measureText: measureContentDrawingText }),
  ]);
}
