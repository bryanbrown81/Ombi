import { DestroyRef, Injectable, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from "rxjs";

import { IMultiSearchResult } from "../../interfaces";
import { SearchV2Service } from "../../services";
import { FilterService } from "../../discover/services/filter-service";
import { SearchFilter } from "../../my-nav/SearchFilter";
import { RecentSearchesStore } from "./recent-searches.store";

export interface IInstantSearchResult {
    id: string;
    title: string;
    typeKey: string;
    icon: string;
    poster: string | null;
    overview: string;
    link: string[];
}

export type InstantSearchOption =
    | { kind: "recent"; id: string; term: string }
    | { kind: "result"; id: string; result: IInstantSearchResult }
    | { kind: "all"; id: string; term: string };

export const INSTANT_SEARCH_MIN_CHARS = 2;
export const INSTANT_SEARCH_DEBOUNCE_MS = 220;
const MAX_RESULTS = 6;
const TMDB_THUMB = "https://image.tmdb.org/t/p/w92";

let nextListboxId = 0;

export function toInstantResult(m: IMultiSearchResult): IInstantSearchResult {
    const kind = (m.mediaType ?? "").toLowerCase();
    const poster = m.poster
        ? (/^https?:\/\//.test(m.poster) ? m.poster : `${TMDB_THUMB}${m.poster.startsWith("/") ? "" : "/"}${m.poster}`)
        : null;
    switch (kind) {
        case "tv":
            return { id: String(m.id), title: m.title, overview: m.overview, poster, typeKey: "Common.tvShow", icon: "fas fa-tv", link: ["/details/tv", String(m.id)] };
        case "artist":
            return { id: String(m.id), title: m.title, overview: m.overview, poster: null, typeKey: "NavigationBar.Filter.Music", icon: "fas fa-music", link: ["/details/artist", String(m.id)] };
        case "person":
            return { id: String(m.id), title: m.title, overview: m.overview, poster, typeKey: "NavigationBar.Filter.People", icon: "fas fa-user", link: ["/discover/actor", String(m.id)] };
        default:
            return { id: String(m.id), title: m.title, overview: m.overview, poster, typeKey: "Common.movie", icon: "fas fa-film", link: ["/details/movie", String(m.id)] };
    }
}

/**
 * State and keyboard behaviour for one instant-search box (a WAI-ARIA combobox with a
 * listbox popup). Provide it at component level so each search box gets its own instance.
 */
@Injectable()
export class InstantSearchController {
    private readonly searchService = inject(SearchV2Service);
    private readonly router = inject(Router);
    private readonly filterService = inject(FilterService);
    private readonly recentStore = inject(RecentSearchesStore);
    private readonly destroyRef = inject(DestroyRef);

    public readonly listboxId = `ombi-search-listbox-${nextListboxId++}`;
    public readonly query = signal("");
    public readonly results = signal<IInstantSearchResult[]>([]);
    /** The term the current `results` belong to. */
    public readonly resultsTerm = signal("");
    public readonly loading = signal(false);
    public readonly open = signal(false);
    public readonly activeIndex = signal(-1);
    /** When true only recent searches are offered (e.g. the results page already updates live). */
    public readonly suggestionsOnly = signal(false);
    public readonly recents = this.recentStore.items;

    public readonly term = computed(() => this.query().trim());
    public readonly options = computed<InstantSearchOption[]>(() => {
        const term = this.term();
        if (!term) {
            return this.recents().map((t, i) => ({ kind: "recent" as const, id: `${this.listboxId}-recent-${i}`, term: t }));
        }
        if (this.suggestionsOnly() || term.length < INSTANT_SEARCH_MIN_CHARS) {
            return [];
        }
        const list: InstantSearchOption[] = this.results().map((result, i) => ({ kind: "result" as const, id: `${this.listboxId}-result-${i}`, result }));
        list.push({ kind: "all", id: `${this.listboxId}-all`, term });
        return list;
    });
    public readonly activeOption = computed(() => this.options()[this.activeIndex()] ?? null);
    public readonly activeOptionId = computed(() => this.activeOption()?.id ?? null);
    public readonly panelVisible = computed(() => this.open() && (!this.term() || !this.suggestionsOnly()));
    /** Results on screen belong to an older term while a newer one is loading. */
    public readonly stale = computed(() => this.loading() && this.results().length > 0);

    private readonly search$ = new Subject<void>();

    constructor() {
        this.search$.pipe(
            map(() => ({ term: this.term(), filter: this.currentFilter() })),
            debounceTime(INSTANT_SEARCH_DEBOUNCE_MS),
            distinctUntilChanged((a, b) => a.term === b.term && JSON.stringify(a.filter) === JSON.stringify(b.filter)),
            switchMap(({ term, filter }) => {
                if (term.length < INSTANT_SEARCH_MIN_CHARS || this.suggestionsOnly()) {
                    return of({ term, results: [] as IMultiSearchResult[] });
                }
                return this.searchService.multiSearch(term, filter).pipe(
                    map(results => ({ term, results: results ?? [] })),
                    catchError(() => of({ term, results: [] as IMultiSearchResult[] })),
                );
            }),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(({ term, results }) => {
            this.resultsTerm.set(term);
            this.results.set(results.slice(0, MAX_RESULTS).map(toInstantResult));
            this.loading.set(false);
            this.activeIndex.set(-1);
        });

        this.filterService.onFilterChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (this.term()) {
                this.loading.set(this.term().length >= INSTANT_SEARCH_MIN_CHARS && !this.suggestionsOnly());
                this.search$.next();
            }
        });
    }

    public setQuery(value: string): void {
        this.query.set(value ?? "");
        this.open.set(true);
        this.activeIndex.set(-1);
        const term = this.term();
        this.loading.set(term.length >= INSTANT_SEARCH_MIN_CHARS && !this.suggestionsOnly() && term !== this.resultsTerm());
        this.search$.next();
    }

    public openPanel(): void {
        this.open.set(true);
    }

    public close(): void {
        this.open.set(false);
        this.activeIndex.set(-1);
    }

    /** Handles combobox keys. Returns true when the key was consumed. */
    public handleKeydown(event: KeyboardEvent): boolean {
        const count = this.options().length;
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this.open.set(true);
                if (count) {
                    this.activeIndex.set((this.activeIndex() + 1) % count);
                }
                return true;
            case "ArrowUp":
                event.preventDefault();
                this.open.set(true);
                if (count) {
                    this.activeIndex.set(this.activeIndex() <= 0 ? count - 1 : this.activeIndex() - 1);
                }
                return true;
            case "Enter": {
                event.preventDefault();
                const option = this.open() ? this.activeOption() : null;
                if (option) {
                    this.activate(option);
                } else if (this.term()) {
                    this.goToResults(this.term());
                }
                return true;
            }
            case "Escape":
                if (this.open() && (this.panelVisible() || this.activeIndex() >= 0)) {
                    event.preventDefault();
                    this.close();
                    return true;
                }
                return false;
            case "Delete": {
                const option = this.activeOption();
                if (option?.kind === "recent") {
                    event.preventDefault();
                    this.removeRecent(option.term);
                    return true;
                }
                return false;
            }
            case "Tab":
                this.close();
                return false;
        }
        return false;
    }

    public activate(option: InstantSearchOption): void {
        switch (option.kind) {
            case "recent":
                this.query.set(option.term);
                this.goToResults(option.term);
                break;
            case "result":
                this.recentStore.add(this.term());
                this.close();
                this.router.navigate(option.result.link);
                break;
            case "all":
                this.goToResults(option.term);
                break;
        }
    }

    public goToResults(term: string): void {
        const value = (term ?? "").trim();
        if (!value) {
            return;
        }
        this.recentStore.add(value);
        this.close();
        this.router.navigate(["discover", value]);
    }

    public removeRecent(term: string): void {
        this.recentStore.remove(term);
        this.activeIndex.set(Math.min(this.activeIndex(), this.options().length - 1));
    }

    public clearRecents(): void {
        this.recentStore.clear();
        this.activeIndex.set(-1);
    }

    public remember(term: string): void {
        this.recentStore.add(term);
    }

    private currentFilter(): SearchFilter {
        if (this.filterService.filter) {
            return this.filterService.filter;
        }
        try {
            const stored = localStorage.getItem("searchFilter");
            if (stored) {
                return Object.assign(new SearchFilter(), JSON.parse(stored));
            }
        } catch {
            // Fall through to the default filter.
        }
        return new SearchFilter({ movies: true, tvShows: true, people: false, music: false });
    }
}
