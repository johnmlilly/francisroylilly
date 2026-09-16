import { renderEmail, button } from './layout.js';

interface ConfirmSubscriptionParams {
  firstName: string;
  confirmUrl: string;
}

export function confirmSubscriptionEmail({ firstName, confirmUrl }: ConfirmSubscriptionParams): {
  subject: string;
  html: string;
} {
  const subject = 'Confirm your subscription';

  const bodyHtml = `
    <p>Hi ${firstName},</p>
    <p>Thanks for signing up for updates about Francis's journey. Please confirm your email to start receiving them.</p>
    ${button(confirmUrl, 'Confirm subscription')}
    <p style="margin-top:24px;font-size:13px;color:#60739f;">If you didn't request this, you can ignore this email.</p>
  `;

  return { subject, html: renderEmail({ previewText: subject, bodyHtml }) };
}
