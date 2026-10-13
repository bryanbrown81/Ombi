import { describe, it, expect } from 'vitest';
import { SpotlightComponent } from './spotlight.component';

describe('SpotlightComponent', () => {
  describe('greetingKeyFor', () => {
    it('greets by time of day', () => {
      expect(SpotlightComponent.greetingKeyFor(6)).toBe('Discovery.Spotlight.Morning');
      expect(SpotlightComponent.greetingKeyFor(11)).toBe('Discovery.Spotlight.Morning');
      expect(SpotlightComponent.greetingKeyFor(12)).toBe('Discovery.Spotlight.Afternoon');
      expect(SpotlightComponent.greetingKeyFor(17)).toBe('Discovery.Spotlight.Afternoon');
      expect(SpotlightComponent.greetingKeyFor(18)).toBe('Discovery.Spotlight.Evening');
      expect(SpotlightComponent.greetingKeyFor(23)).toBe('Discovery.Spotlight.Evening');
    });
  });

  describe('buildWall', () => {
    it('returns no rows without posters', () => {
      expect(SpotlightComponent.buildWall([])).toEqual([]);
    });

    it('builds three rows, each duplicated so the marquee loops seamlessly', () => {
      const posters = Array.from({ length: 30 }, (_, i) => `p${i}`);
      const rows = SpotlightComponent.buildWall(posters);
      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row.length).toBe(20);
        expect(row.slice(0, 10)).toEqual(row.slice(10));
      }
      // Rows take consecutive slices so neighbouring rows show different artwork.
      expect(rows[0][0]).toBe('p0');
      expect(rows[1][0]).toBe('p10');
      expect(rows[2][0]).toBe('p20');
    });

    it('wraps around when there are only a few posters', () => {
      const rows = SpotlightComponent.buildWall(['a', 'b', 'c']);
      expect(rows.length).toBe(3);
      expect(rows[0].length).toBe(12);
      expect(rows.flat().every(p => ['a', 'b', 'c'].includes(p))).toBe(true);
    });
  });
});
