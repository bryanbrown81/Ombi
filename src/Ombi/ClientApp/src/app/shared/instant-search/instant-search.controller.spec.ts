import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DestroyRef, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';

import { InstantSearchController, INSTANT_SEARCH_DEBOUNCE_MS, toInstantResult } from './instant-search.controller';
import { RecentSearchesStore } from './recent-searches.store';
import { SearchV2Service } from '../../services';
import { FilterService } from '../../discover/services/filter-service';
import { IMultiSearchResult } from '../../interfaces';

const results: IMultiSearchResult[] = [
  { id: '693134', mediaType: 'movie', title: 'Dune: Part Two', poster: '/dune2.jpg', overview: 'Paul unites with the Fremen.' },
  { id: '438631', mediaType: 'movie', title: 'Dune', poster: '/dune.jpg', overview: 'A gifted young heir.' },
  { id: '1399', mediaType: 'tv', title: 'Dune: Prophecy', poster: null, overview: '' },
];

function setup() {
  const searchService = { multiSearch: vi.fn().mockReturnValue(of(results)) };
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const filterService = { filter: undefined as any, onFilterChange: new Subject<any>() };
  const destroyRef = { onDestroy: vi.fn(() => () => { }) };
  const injector = Injector.create({
    providers: [
      { provide: SearchV2Service, useValue: searchService },
      { provide: Router, useValue: router },
      { provide: FilterService, useValue: filterService },
      { provide: DestroyRef, useValue: destroyRef },
      { provide: RecentSearchesStore, useFactory: () => new RecentSearchesStore(), deps: [] },
      { provide: InstantSearchController, useClass: InstantSearchController, deps: [] },
    ],
  });
  const ctrl = injector.get(InstantSearchController);
  const store = injector.get(RecentSearchesStore);
  return { ctrl, store, searchService, router, filterService };
}

function key(k: string) {
  return new KeyboardEvent('keydown', { key: k, cancelable: true });
}

describe('InstantSearchController', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers recent searches while the query is empty', () => {
    const { ctrl, store } = setup();
    store.add('Severance');
    store.add('Dune');
    expect(ctrl.options().map(o => o.kind)).toEqual(['recent', 'recent']);
    expect(ctrl.options().map(o => (o as any).term)).toEqual(['Dune', 'Severance']);
  });

  it('debounces typing into a single search with the default filter', () => {
    const { ctrl, searchService } = setup();
    ctrl.setQuery('d');
    ctrl.setQuery('du');
    ctrl.setQuery('dune');
    expect(ctrl.loading()).toBe(true);
    expect(searchService.multiSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);

    expect(searchService.multiSearch).toHaveBeenCalledTimes(1);
    expect(searchService.multiSearch.mock.calls[0][0]).toBe('dune');
    expect(searchService.multiSearch.mock.calls[0][1]).toMatchObject({ movies: true, tvShows: true });
    expect(ctrl.loading()).toBe(false);
    expect(ctrl.resultsTerm()).toBe('dune');
    // Results plus the trailing "see all" option
    expect(ctrl.options().map(o => o.kind)).toEqual(['result', 'result', 'result', 'all']);
  });

  it('does not search for single characters', () => {
    const { ctrl, searchService } = setup();
    ctrl.setQuery('d');
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS * 2);
    expect(searchService.multiSearch).not.toHaveBeenCalled();
    expect(ctrl.loading()).toBe(false);
    expect(ctrl.options()).toEqual([]);
  });

  it('cancels an in-flight search when the query changes', () => {
    const { ctrl, searchService } = setup();
    const slow = new Subject<IMultiSearchResult[]>();
    searchService.multiSearch.mockReturnValueOnce(slow).mockReturnValueOnce(of([results[0]]));

    ctrl.setQuery('du');
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
    ctrl.setQuery('dune two');
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);

    slow.next(results); // late response for the old term is ignored
    expect(ctrl.resultsTerm()).toBe('dune two');
    expect(ctrl.results().map(r => r.title)).toEqual(['Dune: Part Two']);
  });

  it('only offers recents when suggestionsOnly is set (results page)', () => {
    const { ctrl, searchService } = setup();
    ctrl.suggestionsOnly.set(true);
    ctrl.setQuery('dune');
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
    expect(searchService.multiSearch).not.toHaveBeenCalled();
    expect(ctrl.panelVisible()).toBe(false);
  });

  it('re-runs the current search when the nav filter changes', () => {
    const { ctrl, searchService, filterService } = setup();
    ctrl.setQuery('dune');
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
    filterService.filter = { movies: false, tvShows: true, music: false, people: false };
    filterService.onFilterChange.next(filterService.filter);
    vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
    expect(searchService.multiSearch).toHaveBeenCalledTimes(2);
    expect(searchService.multiSearch.mock.calls[1][1]).toMatchObject({ movies: false, tvShows: true });
  });

  describe('keyboard', () => {
    it('moves through options with the arrow keys, wrapping at both ends', () => {
      const { ctrl } = setup();
      ctrl.setQuery('dune');
      vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
      const count = ctrl.options().length;

      ctrl.handleKeydown(key('ArrowUp'));
      expect(ctrl.activeIndex()).toBe(count - 1);
      ctrl.handleKeydown(key('ArrowDown'));
      expect(ctrl.activeIndex()).toBe(0);
      ctrl.handleKeydown(key('ArrowDown'));
      expect(ctrl.activeIndex()).toBe(1);
      expect(ctrl.activeOptionId()).toBe(ctrl.options()[1].id);
    });

    it('Enter with no active option opens the full results and remembers the term', () => {
      const { ctrl, router, store } = setup();
      ctrl.setQuery('  dune  ');
      const handled = ctrl.handleKeydown(key('Enter'));
      expect(handled).toBe(true);
      expect(router.navigate).toHaveBeenCalledWith(['discover', 'dune']);
      expect(store.items()).toEqual(['dune']);
      expect(ctrl.open()).toBe(false);
    });

    it('Enter on a result opens its details page', () => {
      const { ctrl, router } = setup();
      ctrl.setQuery('dune');
      vi.advanceTimersByTime(INSTANT_SEARCH_DEBOUNCE_MS);
      ctrl.handleKeydown(key('ArrowDown'));
      ctrl.handleKeydown(key('Enter'));
      expect(router.navigate).toHaveBeenCalledWith(['/details/movie', '693134']);
    });

    it('Escape closes an open panel and reports when it did nothing', () => {
      const { ctrl } = setup();
      ctrl.openPanel();
      expect(ctrl.handleKeydown(key('Escape'))).toBe(true);
      expect(ctrl.open()).toBe(false);
      expect(ctrl.handleKeydown(key('Escape'))).toBe(false);
    });

    it('Delete removes the highlighted recent search', () => {
      const { ctrl, store } = setup();
      store.add('Severance');
      store.add('Dune');
      ctrl.openPanel();
      ctrl.handleKeydown(key('ArrowDown'));
      ctrl.handleKeydown(key('Delete'));
      expect(store.items()).toEqual(['Severance']);
    });
  });

  it('activating a recent search runs it', () => {
    const { ctrl, router, store } = setup();
    store.add('Severance');
    ctrl.activate(ctrl.options()[0]);
    expect(ctrl.query()).toBe('Severance');
    expect(router.navigate).toHaveBeenCalledWith(['discover', 'Severance']);
  });
});

describe('toInstantResult', () => {
  it('maps movies and tv shows to their details pages with TMDb thumbnails', () => {
    expect(toInstantResult(results[0])).toMatchObject({
      typeKey: 'Common.movie',
      link: ['/details/movie', '693134'],
      poster: 'https://image.tmdb.org/t/p/w92/dune2.jpg',
    });
    expect(toInstantResult(results[2])).toMatchObject({ typeKey: 'Common.tvShow', link: ['/details/tv', '1399'], poster: null });
  });

  it('maps people and artists', () => {
    expect(toInstantResult({ id: '1', mediaType: 'person', title: 'Zendaya', poster: 'abc.jpg', overview: '' }))
      .toMatchObject({ link: ['/discover/actor', '1'], poster: 'https://image.tmdb.org/t/p/w92/abc.jpg' });
    expect(toInstantResult({ id: 'mb-1', mediaType: 'Artist', title: 'Daft Punk', poster: 'http://x/y.png', overview: '' }))
      .toMatchObject({ link: ['/details/artist', 'mb-1'], poster: null, icon: 'fas fa-music' });
  });
});
