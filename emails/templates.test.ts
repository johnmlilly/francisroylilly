import { describe, expect, it } from 'vitest';
import { confirmSubscriptionEmail } from './confirmSubscription.js';
import { newPostNotificationEmail } from './newPostNotification.js';
import { subscriberReportEmail } from './subscriberReport.js';

describe('confirmSubscriptionEmail', () => {
  it('greets by escaped first name and links to the confirm URL', () => {
    const { subject, html } = confirmSubscriptionEmail({
      firstName: '<b>Jane</b>',
      confirmUrl: 'https://francisroylilly.com/api/confirm?token=abc',
    });
    expect(subject).toBe('Confirm your subscription');
    expect(html).toContain('Hi &lt;b&gt;Jane&lt;/b&gt;,');
    expect(html).not.toContain('<b>Jane</b>');
    expect(html).toContain('href="https://francisroylilly.com/api/confirm?token=abc"');
  });
});

describe('newPostNotificationEmail', () => {
  it('escapes title and description and includes post and unsubscribe links', () => {
    const { subject, html } = newPostNotificationEmail({
      firstName: 'Jane',
      title: 'Tom & Jerry <3',
      description: 'A "quoted" day',
      postUrl: 'https://francisroylilly.com/blog/tom-and-jerry/',
      unsubscribeUrl: 'https://francisroylilly.com/api/unsubscribe?token=abc',
    });
    expect(subject).toBe('New update: Tom & Jerry <3');
    expect(html).toContain('Tom &amp; Jerry &lt;3');
    expect(html).toContain('A &quot;quoted&quot; day');
    expect(html).not.toContain('<3');
    expect(html).toContain('href="https://francisroylilly.com/blog/tom-and-jerry/"');
    expect(html).toContain('href="https://francisroylilly.com/api/unsubscribe?token=abc"');
  });
});

describe('subscriberReportEmail', () => {
  const periodStart = new Date('2026-09-10T00:00:00Z');
  const periodEnd = new Date('2026-09-17T00:00:00Z');

  it('reports zero new subscribers without a table', () => {
    const { subject, html } = subscriberReportEmail({ rows: [], periodStart, periodEnd });
    expect(subject).toBe('Weekly subscriber report: 0 new subscribers');
    expect(html).toContain('No new subscribers this week.');
    expect(html).not.toContain('<th');
  });

  it('lists each subscriber, escaped, with confirmed status', () => {
    const { subject, html } = subscriberReportEmail({
      rows: [
        {
          firstName: '<b>Jane</b>',
          lastName: 'Doe',
          email: 'jane@example.com',
          createdAt: new Date('2026-09-12T00:00:00Z'),
          confirmedAt: new Date('2026-09-12T01:00:00Z'),
        },
        {
          firstName: 'Sam',
          lastName: 'Roe',
          email: 'sam@example.com',
          createdAt: new Date('2026-09-13T00:00:00Z'),
          confirmedAt: null,
        },
      ],
      periodStart,
      periodEnd,
    });

    expect(subject).toBe('Weekly subscriber report: 2 new subscribers');
    expect(html).toContain('&lt;b&gt;Jane&lt;/b&gt; Doe');
    expect(html).not.toContain('<b>Jane</b>');
    expect(html).toContain('jane@example.com');
    expect(html).toContain('sam@example.com');
    expect(html).toContain('>Yes<');
    expect(html).toContain('>No<');
  });
});
