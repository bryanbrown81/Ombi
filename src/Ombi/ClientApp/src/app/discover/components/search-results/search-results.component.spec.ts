import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';

import { DiscoverSearchResultsComponent } from './search-results.component';
import { SearchV2Service } from '../../../services';
import { FilterService } from '../../services/filter-service';
import { AdvancedSearchDialogDataService } from '../../../shared/advanced-search-dialog/advanced-search-dialog-data.service';
import { StorageService } from '../../../shared/storage/storage-service';
import { AuthService } from '../../../auth/auth.service';
import { FeaturesFacade } from '../../../state/features/features.facade';
import { IMultiSearchResult, RequestType } from '../../../interfaces';

const multi: IMultiSearchResult[] = [
  { id: '1', mediaType: 'movie', title: 'Dune', poster: '/a.jpg', overview: '' },
  { id: '2', mediaType: 'movie', title: 'Dune: Part Two', poster: '/b.jpg', overview: '' },
  { id: '3', mediaType: 'tv', title: 'Dune: Prophecy', poster: null, overview: '' },
];

const flush = () => new Promise(r => setTimeout(r, 0));

function setup(url = '/discover/dune') {
  const params = new Subject<any>();
  const searchService = {
    multiSearch: vi.fn().mockReturnValue(of(multi)),
    advancedSearch: vi.fn().mockResolvedValue([]),
  };
  const advanced = {
    onDataChange: new Subject<any>(),
    getData: vi.fn().mockReturnValue([{ id: 7, title: 'Mad Max', posterPath: '/m.jpg', overview: '' }]),
    getType: vi.fn().mockReturnValue(RequestType.movie),
    getLabel: vi.fn().mockReturnValue('Action'),
    getOptions: vi.fn().mockReturnValue({ type: RequestType.movie, genres: [28] }),
  };
  const injector = Injector.create({
    providers: [
      { provide: SearchV2Service, useValue: searchService },
      { provide: ActivatedRoute, useValue: { params } },
      { provide: Router, useValue: { url } },
      { provide: FilterService, useValue: { onFilterChange: new Subject<any>() } },
      { provide: AdvancedSearchDialogDataService, useValue: advanced },
      { provide: StorageService, useValue: { get: vi.fn().mockReturnValue(null) } },
      { provide: AuthService, useValue: { isAdmin: () => false } },
      { provide: FeaturesFacade, useValue: { is4kEnabled: () => false } },
      { provide: DestroyRef, useValue: { onDestroy: () => () => { } } },
    ],
  });
  let component: DiscoverSearchResultsComponent;
  runInInjectionContext(injector, () => {
    component = new DiscoverSearchResultsComponent();
  });
  return { component: component!, params, searchService, advanced };
}

describe('DiscoverSearchResultsComponent', () => {
  beforeEach(() => localStorage.clear());

  it('searches for the route term and maps the results', async () => {
    const { component, params, searchService } = setup();
    params.next({ searchTerm: 'dune' });
    await flush();

    expect(searchService.multiSearch).toHaveBeenCalledWith('dune', expect.objectContaining({ movies: true, tvShows: true }));
    expect(component.loading()).toBe(false);
    expect(component.discoverResults().map(r => r.type)).toEqual([RequestType.movie, RequestType.movie, RequestType.tvShow]);
    expect(component.showEmpty()).toBe(false);
  });

  it('builds type tabs with counts and filters by the selected tab', async () => {
    const { component, params } = setup();
    params.next({ searchTerm: 'dune' });
    await flush();

    expect(component.tabs().map(t => [t.id, t.count])).toEqual([['all', 3], [RequestType.movie, 2], [RequestType.tvShow, 1]]);
    component.selectTab(RequestType.tvShow);
    expect(component.visibleResults().map(r => r.title)).toEqual(['Dune: Prophecy']);
    expect(component.tabIndex()).toBe(2);
  });

  it('falls back to "all" when the selected type has no results for a new query', async () => {
    const { component, params, searchService } = setup();
    params.next({ searchTerm: 'dune' });
    await flush();
    component.selectTab(RequestType.tvShow);

    searchService.multiSearch.mockReturnValue(of([multi[0]]));
    params.next({ searchTerm: 'dune 2021' });
    await flush();

    expect(component.effectiveTab()).toBe('all');
    expect(component.visibleResults().length).toBe(1);
  });

  it('keeps previous results visible (refreshing) while a new search loads', async () => {
    const { component, params, searchService } = setup();
    params.next({ searchTerm: 'dune' });
    await flush();

    const pending = new Subject<IMultiSearchResult[]>();
    searchService.multiSearch.mockReturnValue(pending);
    params.next({ searchTerm: 'dune two' });

    expect(component.refreshing()).toBe(true);
    expect(component.showSkeleton()).toBe(false);
    expect(component.discoverResults().length).toBe(3);

    pending.next([multi[1]]);
    pending.complete();
    await flush();
    expect(component.refreshing()).toBe(false);
    expect(component.discoverResults().map(r => r.title)).toEqual(['Dune: Part Two']);
  });

  it('ignores a slower response for an older query', async () => {
    const { component, params, searchService } = setup();
    const slow = new Subject<IMultiSearchResult[]>();
    searchService.multiSearch.mockReturnValueOnce(slow).mockReturnValueOnce(of([multi[2]]));

    params.next({ searchTerm: 'du' });
    params.next({ searchTerm: 'dune prophecy' });
    await flush();
    slow.next(multi);
    slow.complete();
    await flush();

    expect(component.discoverResults().map(r => r.title)).toEqual(['Dune: Prophecy']);
  });

  it('shows the empty state when nothing matches', async () => {
    const { component, params, searchService } = setup();
    searchService.multiSearch.mockReturnValue(of([]));
    params.next({ searchTerm: 'zzz' });
    await flush();
    expect(component.showEmpty()).toBe(true);
    expect(component.hasResults()).toBe(false);
  });

  it('labels advanced (genre) results and only pages them on scroll', async () => {
    const { component, params, searchService } = setup('/discover/advanced/search');
    params.next({});
    await flush();

    expect(component.isAdvancedSearch()).toBe(true);
    expect(component.advancedLabel()).toBe('Action');
    expect(component.discoverResults().map(r => r.title)).toEqual(['Mad Max']);
    expect(searchService.multiSearch).not.toHaveBeenCalled();

    component.onScroll();
    expect(searchService.advancedSearch).toHaveBeenCalledWith(expect.objectContaining({ type: 'movie', genreIds: [28] }), 30, 30);
  });

  it('does not run an advanced search when scrolling normal results', async () => {
    const { component, params, searchService } = setup();
    params.next({ searchTerm: 'dune' });
    await flush();
    component.onScroll();
    expect(searchService.advancedSearch).not.toHaveBeenCalled();
  });
});
