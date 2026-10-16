import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailItem, DetailList } from './panel';
import { InspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';

it('renders informational values as readable text without disabled editing controls or interpreting file names', () => {
  const markup = renderToStaticMarkup(
    <DetailList>
      <DetailItem label="Source" value="<script>source.mp4</script>" />
      <DetailItem label="Position" value={-120} />
    </DetailList>
  );
  expect(markup).toContain('&lt;script&gt;source.mp4&lt;/script&gt;');
  expect(markup).toContain('>-120<');
  expect(markup).not.toMatch(/<(input|button|script)\b/);
});

it('uses the scoped static row without field activation or value truncation', () => {
  const markup = renderToStaticMarkup(
    <InspectorLayout>
      <DetailList>
        <DetailItem label="Source" value="Длинное имя исходника recording.mp4" />
      </DetailList>
    </InspectorLayout>
  );
  expect(markup).toContain('sniptale-static-parameter-row');
  expect(markup).not.toContain('data-activates');
  expect(markup).not.toContain('truncate');
  expect(markup).not.toMatch(/<(input|button)\b/);
});
