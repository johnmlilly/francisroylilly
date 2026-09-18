import { renderEmail, button, escapeHtml } from './layout.js';

interface NewPostNotificationParams {
  firstName: string;
  title: string;
  description: string;
  postUrl: string;
  unsubscribeUrl: string;
}

export function newPostNotificationEmail({
  firstName,
  title,
  description,
  postUrl,
  unsubscribeUrl,
}: NewPostNotificationParams): { subject: string; html: string } {
  const subject = `New update: ${title}`;

  const bodyHtml = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>There's a new update about Francis's journey:</p>
    <h2 style="margin:16px 0 4px;color:#4C6085;font-size:20px;">${escapeHtml(title)}</h2>
    <p style="margin:0 0 8px;color:#4C6085;">${escapeHtml(description)}</p>
    ${button(postUrl, 'Read the full update')}
  `;

  const footerHtml = `You're receiving this because you subscribed for updates about Francis. <a href="${unsubscribeUrl}" style="color:#60739f;">Unsubscribe</a>`;

  return { subject, html: renderEmail({ previewText: subject, bodyHtml, footerHtml }) };
}
