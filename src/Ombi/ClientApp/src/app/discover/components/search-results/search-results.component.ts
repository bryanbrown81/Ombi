import { ActivatedRoute, Router } from "@angular/router";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { TranslateModule } from "@ngx-translate/core";
import { firstValueFrom } from "rxjs";

import { IMultiSearchResult, ISearchMovieResult, RequestType } from "../../../interfaces";
import { AdvancedSearchDialogDataService } from "../../../shared/advanced-search-dialog/advanced-search-dialog-data.service";
import { AuthService } from "../../../auth/auth.service";
import { FilterService } from "../../services/filter-service";
import { IDiscoverCardResult } from "../../interfaces";
import { SearchFilter } from "../../../my-nav/SearchFilter";
import { SearchV2Service } from "../../../services";
import { StorageService } from "../../../shared/storage/storage-service";
import { isEqual } from "lodash-es";
import { FeaturesFacade } from "../../../state/features/features.facade";
import { DiscoverCardComponent } from "../card/discover-card.component";
import { InfiniteScrollModule } from "ngx-infinite-scroll";

export type ResultTab = "all" | RequestType;

interface IResultTabOption {
    id: ResultTab;
    labelKey: string;
    count: number;
}

const TAB_LABELS: Record<number, string> = {
    [RequestType.movie]: "Discovery.Movies",
    [RequestType.tvShow]: "Discovery.Tv",
    [RequestType.album]: "NavigationBar.Filter.Music",
};
const ADVANCED_PAGE_SIZE = 30;

@Component({
    standalone: true,
    templateUrl: "./search-results.component.html",
    styleUrls: ["./search-results.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        TranslateModule,
        DiscoverCardComponent,
        InfiniteScrollModule
    ]
})
export class DiscoverSearchResultsComponent implements OnInit {

    public readonly loading = signal<boolean>(true);
    public readonly loadingMore = signal<boolean>(false);
    public readonly searchTerm = signal<string>("");
    public readonly isAdvancedSearch = signal<boolean>(false);
    public readonly advancedLabel = signal<string | null>(null);
    public readonly discoverResults = signal<IDiscoverCardResult[]>([]);
    public readonly activeTab = signal<ResultTab>("all");

    public isAdmin: boolean;
    public is4kEnabled = false;
    public filter: SearchFilter;

    public readonly hasResults = computed(() => this.discoverResults().length > 0);
    /** New results are loading while the previous ones stay on screen (dimmed). */
    public readonly refreshing = computed(() => this.loading() && this.hasResults());
    public readonly showSkeleton = computed(() => this.loading() && !this.hasResults());
    public readonly showEmpty = computed(() => !this.loading() && !this.hasResults());

    public readonly tabs = computed<IResultTabOption[]>(() => {
        const results = this.discoverResults();
        const tabs: IResultTabOption[] = [{ id: "all", labelKey: "Discovery.Results.All", count: results.length }];
        for (const type of [RequestType.movie, RequestType.tvShow, RequestType.album]) {
            const count = results.filter(r => r.type === type).length;
            if (count > 0) {
                tabs.push({ id: type, labelKey: TAB_LABELS[type], count });
            }
        }
        return tabs;
    });
    /** Falls back to "all" when the chosen type has no results for the current query. */
    public readonly effectiveTab = computed<ResultTab>(() => {
        const tab = this.activeTab();
        return this.tabs().some(t => t.id === tab) ? tab : "all";
    });
    public readonly tabIndex = computed(() => Math.max(0, this.tabs().findIndex(t => t.id === this.effectiveTab())));
    public readonly visibleResults = computed(() => {
        const tab = this.effectiveTab();
        const results = this.discoverResults();
        return tab === "all" ? results : results.filter(r => r.type === tab);
    });

    private readonly searchService = inject(SearchV2Service);
    private readonly route = inject(ActivatedRoute);
    private readonly filterService = inject(FilterService);
    private readonly router = inject(Router);
    private readonly advancedDataService = inject(AdvancedSearchDialogDataService);
    private readonly store = inject(StorageService);
    private readonly authService = inject(AuthService);
    private readonly featureFacade = inject(FeaturesFacade);
    private readonly destroyRef = inject(DestroyRef);

    private loadPosition: number = ADVANCED_PAGE_SIZE;
    /** Incremented per search so slower, older responses are ignored. */
    private searchToken = 0;

    constructor() {
        this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params: any) => {
            this.isAdvancedSearch.set(this.router.url === '/discover/advanced/search');
            if (this.isAdvancedSearch()) {
                this.loadAdvancedData();
                return;
            }
            this.searchTerm.set(params.searchTerm ?? "");
            this.init();
        });

        this.advancedDataService.onDataChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            if (this.isAdvancedSearch()) {
                this.loadAdvancedData();
            }
        });
    }

    public async ngOnInit() {
        this.is4kEnabled = this.featureFacade.is4kEnabled();
        this.isAdmin = this.authService.isAdmin();
        this.filterService.onFilterChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async x => {
            if (!isEqual(this.filter, x)) {
                this.filter = { ...x };
                if (!this.isAdvancedSearch()) {
                    await this.search();
                }
            }
        });
    }

    public async init() {
        var filter = this.store.get("searchFilter");
        if (filter) {
            this.filter = Object.assign(new SearchFilter(), JSON.parse(filter));
        } else {
            this.filter = new SearchFilter({ movies: true, tvShows: true, people: false, music: false });
        }
        await this.search();
    }

    public selectTab(tab: ResultTab): void {
        this.activeTab.set(tab);
    }

    public onScroll() {
        if (this.isAdvancedSearch()) {
            this.loadMoreAdvancedSearch();
        }
    }

    public mapAdvancedData(advancedData: ISearchMovieResult[]): IDiscoverCardResult[] {
        const type = this.advancedDataService.getType();
        return (advancedData ?? []).map(m => {
            const mediaType = type;

            let poster = `https://image.tmdb.org/t/p/w300/${m.posterPath}`;
            if (!m.posterPath) {
                if (mediaType === RequestType.movie) {
                    poster = "images/default_movie_poster.png"
                }
                if (mediaType === RequestType.tvShow) {
                    poster = "images/default_tv_poster.png"
                }
            }

            return {
                posterPath:  poster,
                requested: false,
                title: m.title,
                type: mediaType,
                id: m.id,
                url: "",
                rating: 0,
                overview: m.overview,
                approved: false,
                imdbid: "",
                denied: false,
                background: "",
                available: false,
                tvMovieDb: false
            };
        });
    }

    private mapSearchResults(results: IMultiSearchResult[]): IDiscoverCardResult[] {
        return (results ?? []).map(m => {

            let mediaType = RequestType.movie;
            if (m.mediaType == "movie") {
                mediaType = RequestType.movie;
            } else if (m.mediaType == "tv") {
                mediaType = RequestType.tvShow;
            } else if (m.mediaType == "Artist") {
                mediaType = RequestType.album;
            }

            let poster = `https://image.tmdb.org/t/p/w300/${m.poster}`;
            if (!m.poster) {
                if (mediaType === RequestType.movie) {
                    poster = "images/default_movie_poster.png"
                }
                if (mediaType === RequestType.tvShow) {
                    poster = "images/default_tv_poster.png"
                }
            }

            return {
                posterPath: mediaType !== RequestType.album ? poster : "images/default-music-placeholder.png",
                requested: false,
                title: m.title,
                type: mediaType,
                id: m.id,
                url: "",
                rating: 0,
                overview: m.overview,
                approved: false,
                imdbid: "",
                denied: false,
                background: "",
                available: false,
                tvMovieDb: mediaType === RequestType.tvShow ? true : false
            };
        });
    }

    private loadAdvancedData() {
        this.searchToken++;
        this.loadPosition = ADVANCED_PAGE_SIZE;
        this.advancedLabel.set(this.advancedDataService.getLabel());
        this.activeTab.set("all");
        this.discoverResults.set(this.mapAdvancedData(this.advancedDataService.getData()));
        this.loading.set(false);
    }

    private async loadMoreAdvancedSearch() {
        const advancedOptions = this.advancedDataService.getOptions();
        if (!advancedOptions || this.loadingMore()) {
            return;
        }
        const token = this.searchToken;
        this.loadingMore.set(true);
        try {
            const results = await this.searchService.advancedSearch({
                type: advancedOptions.type == RequestType.movie ? "movie" : "tv",
                companies: advancedOptions.companies,
                genreIds: advancedOptions.genres,
                keywordIds : advancedOptions.keywords,
                releaseYear: advancedOptions.releaseYear,
                watchProviders: advancedOptions.watchProviders,
            }, this.loadPosition, ADVANCED_PAGE_SIZE);
            if (token !== this.searchToken) {
                return;
            }
            this.loadPosition += ADVANCED_PAGE_SIZE;
            const more = this.mapAdvancedData(results);
            this.discoverResults.update(current => [...current, ...more]);
        } finally {
            this.loadingMore.set(false);
        }
    }

    private async search() {
        const token = ++this.searchToken;
        this.loading.set(true);
        let results: IMultiSearchResult[] = [];
        try {
            results = await firstValueFrom(this.searchService.multiSearch(this.searchTerm(), this.filter));
        } catch (err) {
            console.warn("Discover: search failed", err);
        }
        if (token !== this.searchToken) {
            return;
        }
        this.discoverResults.set(this.mapSearchResults(results));
        this.loading.set(false);
    }
}
