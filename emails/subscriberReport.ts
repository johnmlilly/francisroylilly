import { renderEmail, escapeHtml } from './layout.js';

export interface SubscriberReportRow {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  confirmedAt: Date | null;
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
  const subject = `Weekly subscriber report: ${rows.length} new subscriber${rows.length === 1 ? '' : 's'}`;

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td style="${cellStyle}">${escapeHtml(row.firstName)} ${escapeHtml(row.lastName)}</td>
          <td style="${cellStyle}">${escapeHtml(row.email)}</td>
          <td style="${cellStyle}">${formatDate(row.createdAt)}</td>
          <td style="${cellStyle}">${row.confirmedAt ? 'Yes' : 'No'}</td>
        </tr>`
    )
    .join('');

  const table = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="text-align:left;color:#60739f;">
        <th style="${headerStyle}">Name</th>
        <th style="${headerStyle}">Email</th>
        <th style="${headerStyle}">Subscribed</th>
        <th style="${headerStyle}">Confirmed</th>
      </tr>
      ${tableRows}
    </table>`;

  const bodyHtml = `
    <p style="margin:0;color:#60739f;">${formatDate(periodStart)} to ${formatDate(periodEnd)}</p>
    <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#4C6085;">${rows.length} new subscriber${rows.length === 1 ? '' : 's'}</p>
    ${rows.length === 0 ? '<p style="margin-top:16px;">No new subscribers this week.</p>' : table}
  `;

  return { subject, html: renderEmail({ previewText: subject, bodyHtml }) };
}
