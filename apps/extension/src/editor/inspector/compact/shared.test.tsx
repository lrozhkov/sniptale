import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  CompactColorSwatchTrigger,
  CompactCommandField,
  CompactCommandToken,
  CompactLineTrigger,
  renderCompactCommandContent,
  resolveCompactCommandTrigger,
  type CompactCommand,
} from './shared';

function tokenCommand(icon: CompactCommand['icon']): CompactCommand {
  return {
    id: String(icon ?? 'plain'),
    title: 'Command',
    trigger: <CompactCommandToken>PX</CompactCommandToken>,
    ...(icon === undefined ? {} : { icon }),
  };
}

it('renders compact fields, color swatches, and line triggers for toolbar groups', () => {
  expect(
    renderToStaticMarkup(
      <CompactCommandField label="Color" value="42" note="note">
        <div>body</div>
      </CompactCommandField>
    )
  ).toContain('Color');
  expect(
    renderToStaticMarkup(
      <CompactCommandField label="Color" value="42" note="note">
        <div>body</div>
      </CompactCommandField>
    )
  ).not.toContain('tracking-');
  expect(
    renderToStaticMarkup(
      <CompactCommandField hideLabel label="Color" value="42">
        <div>body</div>
      </CompactCommandField>
    )
  ).not.toContain('Color');
  expect(renderToStaticMarkup(<CompactColorSwatchTrigger color="#ff0000" mode="text" />)).toContain(
    'A'
  );
  expect(
    renderToStaticMarkup(<CompactColorSwatchTrigger color="#00ff00" mode="stroke" />)
  ).toContain('--compact-command-color');
  expect(renderToStaticMarkup(<CompactLineTrigger style="dot" width={9} />)).toContain('dotted');
  expect(renderToStaticMarkup(<CompactLineTrigger style="long-dash" width={0} />)).toContain(
    'dashed'
  );
});

it('resolves token triggers to semantic icons while preserving custom triggers', () => {
  expect(
    resolveCompactCommandTrigger({ ...tokenCommand(undefined), trigger: <span>custom</span> })
  ).toEqual(<span>custom</span>);
  for (const icon of [
    'browser',
    'color',
    'link',
    'opacity',
    'preset',
    'size',
    'text',
    'trajectory',
  ] as const) {
    expect(renderToStaticMarkup(<>{resolveCompactCommandTrigger(tokenCommand(icon))}</>)).toContain(
      'svg'
    );
  }
  expect(
    renderToStaticMarkup(<>{resolveCompactCommandTrigger(tokenCommand(undefined))}</>)
  ).toContain('PX');
  expect(renderToStaticMarkup(<CompactCommandToken>PX</CompactCommandToken>)).not.toContain(
    'tracking-'
  );
});

it('hides duplicated compact command field chrome inside collapsed popovers', () => {
  const command: CompactCommand = {
    id: 'width',
    title: 'Толщина',
    trigger: 'PX',
    content: (
      <CompactCommandField label="Толщина" value="8px">
        <div>control</div>
      </CompactCommandField>
    ),
  };

  const hiddenMarkup = renderToStaticMarkup(
    <>{renderCompactCommandContent(command, { hideLabel: true, hideValue: true })}</>
  );

  expect(hiddenMarkup).not.toContain('Толщина');
  expect(hiddenMarkup).not.toContain('8px');
  expect(hiddenMarkup).toContain('control');
});

it('preserves explicit compact command field chrome choices', () => {
  const command: CompactCommand = {
    id: 'font',
    title: 'Шрифт',
    trigger: 'T',
    content: (
      <CompactCommandField hideLabel label="Шрифт" value="Sans">
        <div>select</div>
      </CompactCommandField>
    ),
  };

  const markup = renderToStaticMarkup(<>{renderCompactCommandContent(command)}</>);

  expect(markup).not.toContain('Шрифт');
  expect(markup).not.toContain('Sans');
  expect(markup).toContain('select');
});
