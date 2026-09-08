import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailItem, DetailList } from './panel';

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
