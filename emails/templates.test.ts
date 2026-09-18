import { describe, expect, it } from 'vitest';
import { confirmSubscriptionEmail } from './confirmSubscription.js';
import { newPostNotificationEmail } from './newPostNotification.js';

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
