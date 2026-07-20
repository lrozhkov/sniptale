import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildArrowCompactCommands } from './arrow';

it('uses compact arrow options and keeps the full shadow editor', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.arrow.variant = 'standard';
  params.inspectorToolSettings.arrow.dynamicWidth = false;
  params.inspectorToolSettings.arrow.shadow = 30;
  const commands = buildArrowCompactCommands(params as never);
  const typeControl = (commands[1]?.content as any).props.children;
  const widthControl = (commands[2]?.content as any).props.children;
  const styleControl = (commands[3]?.content as any).props.children;
  const roughnessControl = (commands[5]?.content as any).props.children;
  const bowingControl = (commands[6]?.content as any).props.children;
  const shadowMarkup = renderToStaticMarkup(<>{commands[7]?.content}</>);
  const startHeadControl = (commands[8]?.content as any).props.children;

  expect(typeControl.type.name).toBe('SelectField');
  expect(typeControl.props.label).toBe(translate('editor.compact.arrowType'));
  expect(commands[4]?.content).toBeUndefined();
  expect(commands[4]?.active).toBe(false);
  commands[4]?.onClick?.();
  expect(params.applyArrowPatch).toHaveBeenCalledWith({
    dynamicWidth: true,
    variant: 'tapered',
  });
  expect(styleControl.type.name).toBe('LineStyleSelector');
  expect(widthControl.props.max).toBe(36);
  expect(roughnessControl.props.max).toBe(3);
  expect(bowingControl.props.max).toBe(3);
  expect(shadowMarkup).toContain(translate('editor.compact.shadowSize'));
  expect(shadowMarkup).toContain(translate('editor.compact.shadowAngle'));
  expect(shadowMarkup).toContain(translate('editor.compact.shadowDistance'));
  expect(shadowMarkup).toContain(translate('editor.compact.shadowBlur'));
  expect(startHeadControl.type.name).toBe('SelectField');
  expect(startHeadControl.props.options[0]?.icon).toBeTruthy();
});

it('switches dynamic arrow width back to standard mode when active', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.arrow.dynamicWidth = true;

  const commands = buildArrowCompactCommands(params as never);
  expect(commands[4]?.active).toBe(true);

  commands[4]?.onClick?.();

  expect(params.applyArrowPatch).toHaveBeenCalledWith({
    dynamicWidth: false,
    variant: 'standard',
  });
});
