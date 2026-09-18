import { describe, expect, it } from 'vitest';
import { chunk, secretsMatch, selectNewPosts } from './notify.js';

const now = new Date('2026-09-17T12:00:00Z');
const post = (id: string, pubDate: string, isPublished = true) => ({
  id,
  pubDate: new Date(pubDate),
  isPublished,
});

describe('selectNewPosts', () => {
  it('returns unnotified published posts, oldest first', () => {
    const posts = [post('newer', '2026-09-10'), post('older', '2026-09-01'), post('done', '2026-08-01')];
    const result = selectNewPosts(posts, ['done'], now);
    expect(result.map((p) => p.id)).toEqual(['older', 'newer']);
  });

  it('never includes a draft, even when it has no notification row', () => {
    const posts = [post('draft', '2026-09-01', false), post('live', '2026-09-02')];
    expect(selectNewPosts(posts, [], now).map((p) => p.id)).toEqual(['live']);
  });

  it('holds back posts dated in the future', () => {
    const posts = [post('future', '2026-12-25'), post('today', '2026-09-17T11:59:00Z')];
    expect(selectNewPosts(posts, [], now).map((p) => p.id)).toEqual(['today']);
  });

  it('returns nothing when everything is already notified', () => {
    const posts = [post('a', '2026-01-01'), post('b', '2026-02-01')];
    expect(selectNewPosts(posts, ['a', 'b'], now)).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into groups of at most size, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('secretsMatch', () => {
  it('matches identical secrets', () => {
    expect(secretsMatch('s3cret', 's3cret')).toBe(true);
  });

  it('rejects different secrets of equal and unequal length', () => {
    expect(secretsMatch('s3cret', 's3creT')).toBe(false);
    expect(secretsMatch('s3cret', 's3cret-longer')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });

  it('rejects a missing header or unset secret', () => {
    expect(secretsMatch(null, 's3cret')).toBe(false);
    expect(secretsMatch(undefined, 's3cret')).toBe(false);
    expect(secretsMatch('s3cret', undefined)).toBe(false);
  });
});
