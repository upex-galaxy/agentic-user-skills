import { describe, expect, test } from 'bun:test';
import { labels } from './player.js';

describe('player labels', () => {
  test('follow the video language: Spanish for es, English otherwise, never an opening mark', () => {
    expect(labels('es').play).toBe('Reproducir');
    expect(labels('en').play).toBe('Play');
    expect(labels(undefined).export).toBe('Export MP4');
    for (const l of [labels('es'), labels('en')]) { expect(/[¿¡]/.test(Object.values(l).join(' '))).toBe(false); }
  });
});
