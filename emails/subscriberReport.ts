import { renderEmail, escapeHtml } from './layout.js';

interface SubscriberReportRow {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

interface SubscriberReportParams {
  rows: SubscriberReportRow[];
  periodStart: Date;
  periodEnd: Date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const cellStyle = 'padding:8px;border-bottom:1px solid #e5e0d3;';
const headerStyle = 'padding:8px;border-bottom:2px solid #4C6085;';

export function subscriberReportEmail({ rows, periodStart, periodEnd }: SubscriberReportParams): {
  subject: string;
  html: string;
} {
  // Someone who signed up and left inside the same window still belongs in the
  // table, but counting them would overstate growth.
  const churned = rows.filter((row) => Boolean(row.unsubscribedAt)).length;
  const netCount = rows.length - churned;
  const subject = `Weekly subscriber report: ${netCount} new subscriber${netCount === 1 ? '' : 's'}`;

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td style="${cellStyle}">${escapeHtml(row.firstName)} ${escapeHtml(row.lastName)}</td>
          <td style="${cellStyle}">${escapeHtml(row.email)}</td>
          <td style="${cellStyle}">${formatDate(row.createdAt)}</td>
          <td style="${cellStyle}">${row.unsubscribedAt ? 'Unsubscribed' : row.confirmedAt ? 'Confirmed' : 'Pending'}</td>
        </tr>`
    )
    .join('');

  const table = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="text-align:left;color:#60739f;">
        <th style="${headerStyle}">Name</th>
        <th style="${headerStyle}">Email</th>
        <th style="${headerStyle}">Subscribed</th>
        <th style="${headerStyle}">Status</th>
      </tr>
      ${tableRows}
    </table>`;

  const bodyHtml = `
    <p style="margin:0;color:#60739f;">${formatDate(periodStart)} to ${formatDate(periodEnd)}</p>
    <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#4C6085;">${netCount} new subscriber${netCount === 1 ? '' : 's'}</p>
    ${churned > 0 ? `<p style="margin:4px 0 0;color:#60739f;">${churned} also unsubscribed before this report.</p>` : ''}
    ${rows.length === 0 ? '<p style="margin-top:16px;">No new subscribers this week.</p>' : table}
  `;

  return { subject, html: renderEmail({ previewText: subject, bodyHtml }) };
}
