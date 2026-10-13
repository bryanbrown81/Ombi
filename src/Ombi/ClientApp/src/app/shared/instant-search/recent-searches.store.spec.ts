import { describe, it, expect, beforeEach } from 'vitest';
import { RecentSearchesStore } from './recent-searches.store';

describe('RecentSearchesStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(new RecentSearchesStore().items()).toEqual([]);
  });

  it('adds the newest term first and persists it', () => {
    const store = new RecentSearchesStore();
    store.add('Dune');
    store.add('Severance');
    expect(store.items()).toEqual(['Severance', 'Dune']);
    expect(JSON.parse(localStorage.getItem('discoverRecentSearches'))).toEqual(['Severance', 'Dune']);
  });

  it('de-duplicates case-insensitively, keeping the latest spelling', () => {
    const store = new RecentSearchesStore();
    store.add('dune');
    store.add('Severance');
    store.add('DUNE');
    expect(store.items()).toEqual(['DUNE', 'Severance']);
  });

  it('trims and ignores terms shorter than two characters', () => {
    const store = new RecentSearchesStore();
    store.add('  a ');
    store.add('   ');
    store.add('  up  ');
    expect(store.items()).toEqual(['up']);
  });

  it('keeps at most six terms', () => {
    const store = new RecentSearchesStore();
    ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].forEach(t => store.add(t));
    expect(store.items()).toEqual(['seven', 'six', 'five', 'four', 'three', 'two']);
  });

  it('removes and clears terms', () => {
    const store = new RecentSearchesStore();
    store.add('Dune');
    store.add('Severance');
    store.remove('Dune');
    expect(store.items()).toEqual(['Severance']);
    store.clear();
    expect(store.items()).toEqual([]);
    expect(localStorage.getItem('discoverRecentSearches')).toBe('[]');
  });

  it('reads persisted terms and tolerates corrupt storage', () => {
    localStorage.setItem('discoverRecentSearches', JSON.stringify(['Dune', 42, 'Loki']));
    expect(new RecentSearchesStore().items()).toEqual(['Dune', 'Loki']);
    localStorage.setItem('discoverRecentSearches', '{not json');
    expect(new RecentSearchesStore().items()).toEqual([]);
  });
});
