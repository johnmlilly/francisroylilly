import { describe, expect, it } from 'vitest';
import { button, escapeHtml, renderEmail } from './layout.js';

describe('escapeHtml', () => {
  it('escapes every character that can break out of HTML text or attributes', () => {
    expect(escapeHtml(`Tom & Jerry <b>"quoted"</b> it's`)).toBe(
      'Tom &amp; Jerry &lt;b&gt;&quot;quoted&quot;&lt;/b&gt; it&#39;s'
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Francis Roy Lilly')).toBe('Francis Roy Lilly');
  });
});

describe('renderEmail', () => {
  it('escapes the preview text and includes body and footer', () => {
    const html = renderEmail({
      previewText: 'New update: Tom & Jerry <script>',
      bodyHtml: '<p>Body</p>',
      footerHtml: 'Footer',
    });
    expect(html).toContain('New update: Tom &amp; Jerry &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('Footer');
  });

  it('omits the footer row when none is given', () => {
    const html = renderEmail({ previewText: 'x', bodyHtml: '<p>Body</p>' });
    expect(html).not.toContain('padding:16px 32px 32px');
  });
});

describe('button', () => {
  it('links to the given href with the label', () => {
    const html = button('https://example.com/go', 'Go');
    expect(html).toContain('href="https://example.com/go"');
    expect(html).toContain('>Go</a>');
  });
});
