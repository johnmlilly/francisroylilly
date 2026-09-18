import { SITE_TITLE } from '../src/consts.js';

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Values interpolated into email HTML come from user-submitted form fields or
// post frontmatter; escape them so a stray `<` or `&` can't break the markup.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface LayoutOptions {
  previewText: string;
  bodyHtml: string;
  footerHtml?: string;
}

// Plain inline-styled HTML rather than @react-email/* — a couple of simple
// templates don't justify the extra runtime-compatibility risk of rendering
// JSX inside a Worker request, and email HTML needs inline styles regardless
// of how it's authored.
export function renderEmail({ previewText, bodyHtml, footerHtml }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SITE_TITLE}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f2e9;font-family:${FONT_STACK};">
    <span style="display:none;font-size:1px;color:#f5f2e9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2e9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;background:#4C6085;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;">${SITE_TITLE}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#222939;font-size:16px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            ${
              footerHtml
                ? `<tr>
              <td style="padding:16px 32px 32px;color:#60739f;font-size:12px;line-height:1.5;">
                ${footerHtml}
              </td>
            </tr>`
                : ''
            }
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#B8A86F;color:#ffffff;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>`;
}
