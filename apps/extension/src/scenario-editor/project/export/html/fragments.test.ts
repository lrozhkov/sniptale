import { describe, expect, it } from 'vitest';
import {
  formatScenarioStepIndex,
  renderScenarioStepHeaderHtml,
  renderScenarioTextBodyHtml,
} from './fragments';

describe('formatScenarioStepIndex', () => {
  it('pads step indexes to two digits', () => {
    expect(formatScenarioStepIndex(1)).toBe('01');
    expect(formatScenarioStepIndex(12)).toBe('12');
  });
});

describe('renderScenarioStepHeaderHtml', () => {
  it('renders escaped heading markup with the formatted step index', () => {
    const html = renderScenarioStepHeaderHtml('&lt;Heading&gt;', 3);

    expect(html).toContain('class="step-title"');
    expect(html).toContain('&lt;Heading&gt;');
    expect(html).toContain('>03<');
  });
});

describe('renderScenarioTextBodyHtml', () => {
  it('omits empty bodies and renders escaped paragraph content when present', () => {
    expect(renderScenarioTextBodyHtml('   ')).toBe('');
    expect(renderScenarioTextBodyHtml('<body>', 'step-body')).toBe(
      '<p class="step-body">&lt;body&gt;</p>'
    );
  });
});
