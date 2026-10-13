import { Component, input, output, signal, computed, inject, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslateModule } from "@ngx-translate/core";

import { DiscoverOption, IDiscoverCardResult } from "../../interfaces";
import { ISearchMovieResult, ISearchTvResult, RequestType } from "../../../interfaces";
import { SearchV2Service } from "../../../services";
import { StorageService } from "../../../shared/storage/storage-service";
import { FeaturesFacade } from "../../../state/features/features.facade";
import { APP_BASE_HREF } from "@angular/common";
import { DiscoverCardComponent } from "../card/discover-card.component";
import { MediaRailComponent } from "../media-rail/media-rail.component";

export enum DiscoverType {
    Upcoming,
    Trending,
    Popular,
    RecentlyRequested,
    Seasonal,
}

const OPTION_ORDER = [DiscoverOption.Combined, DiscoverOption.Movie, DiscoverOption.Tv];

@Component({
    standalone: true,
    selector: "carousel-list",
    templateUrl: "./carousel-list.component.html",
    styleUrls: ["./carousel-list.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        TranslateModule,
        DiscoverCardComponent,
        MediaRailComponent
    ]
})
export class CarouselListComponent {
    // Inputs using new input() function
    public discoverType = input.required<DiscoverType>();
    public id = input.required<string>();
    public isAdmin = input<boolean>(false);
    public title = input<string>("");
    /** Editorial section number, e.g. "02". */
    public index = input<string>("");

    // Output using new output() function
    public movieCount = output<number>();

    private readonly rail = viewChild(MediaRailComponent);

    // Services using inject() function
    private searchService = inject(SearchV2Service);
    private storageService = inject(StorageService);
    private featureFacade = inject(FeaturesFacade);
    private baseUrl = inject(APP_BASE_HREF);

    // Public constants
    public DiscoverOption = DiscoverOption;
    public RequestType = RequestType;
    public DiscoverType = DiscoverType;

    // State using signals
    public discoverOptions = signal<DiscoverOption>(DiscoverOption.Combined);
    public discoverResults = signal<IDiscoverCardResult[]>([]);
    public movies = signal<ISearchMovieResult[]>([]);
    public tvShows = signal<ISearchTvResult[]>([]);
    public loadingFlag = signal<boolean>(false);
    public loadingMore = signal<boolean>(false);
    public is4kEnabled = signal<boolean>(false);

    // Computed properties
    public hasResults = computed(() => this.discoverResults().length > 0);
    public totalResults = computed(() => this.discoverResults().length);
    public optionIndex = computed(() => Math.max(0, OPTION_ORDER.indexOf(+this.discoverOptions())));

    get mediaTypeStorageKey() {
        return "DiscoverOptions" + this.discoverType().toString();
    };

    private amountToLoad = 20;
    private currentlyLoaded = 0;
    /** Incremented on every mode switch so late responses for the old mode are dropped. */
    private generation = 0;
    private exhausted = false;

    public async ngOnInit() {
        // Initialize 4K feature flag
        this.is4kEnabled.set(this.featureFacade.is4kEnabled());
        this.currentlyLoaded = 0;

        // Load saved discover options from storage
        const localDiscoverOptions = +this.storageService.get(this.mediaTypeStorageKey);
        if (localDiscoverOptions) {
            this.discoverOptions.set(DiscoverOption[DiscoverOption[localDiscoverOptions]]);
        }

        // Load initial data - just enough to fill the first rail page
        await this.loadData(false);

        // If we don't have enough results to fill the rail, load one more batch
        if (this.discoverResults().length < 20) {
            await this.loadData(false);
        }
    }

    public async selectOption(option: DiscoverOption) {
        await this.switchDiscoverMode(option);
    }

    /** Appends the next page when the rail scrolls near its end. */
    public async loadMore() {
        if (this.loadingMore() || this.loadingFlag() || this.exhausted || !this.hasResults()) {
            return;
        }
        const generation = this.generation;
        const before = this.discoverResults().length;
        this.loadingMore.set(true);
        try {
            await this.fetchPage(this.currentlyLoaded);
            if (generation !== this.generation) {
                return;
            }
            this.currentlyLoaded += this.amountToLoad;
            this.createModel();
            if (this.discoverResults().length === before) {
                this.exhausted = true;
            }
        } catch (err) {
            console.warn("Discover: failed to load more results", err);
        } finally {
            this.loadingMore.set(false);
        }
    }

    private async loadData(clearExisting: boolean = true) {
        const generation = this.generation;
        await this.fetchPage(this.currentlyLoaded);
        if (generation !== this.generation) {
            return;
        }
        this.currentlyLoaded += this.amountToLoad;
        this.createInitialModel(clearExisting);
    }

    private async fetchPage(offset: number) {
        const generation = this.generation;
        let moviePromise: Promise<void>;
        let tvPromise: Promise<void>;
        switch (+this.discoverOptions()) {
            case DiscoverOption.Combined:
                moviePromise = this.loadMovies(offset, generation);
                tvPromise = this.loadTv(offset, generation);
                break;
            case DiscoverOption.Movie:
                moviePromise = this.loadMovies(offset, generation);
                break;
            case DiscoverOption.Tv:
                tvPromise = this.loadTv(offset, generation);
                break;
        }
        await Promise.all([moviePromise, tvPromise].filter(Boolean));
    }

    private async switchDiscoverMode(newMode: DiscoverOption) {
        if (this.discoverOptions() === newMode) {
            return;
        }
        this.generation++;
        this.exhausted = false;
        this.loading();
        this.currentlyLoaded = 0;
        this.discoverOptions.set(+newMode);
        this.storageService.save(this.mediaTypeStorageKey, newMode.toString());
        this.rail()?.scrollToStart();
        try {
            await this.loadData();
        } finally {
            this.finishLoading();
        }
    }

    private async loadMovies(offset?: number, generation = this.generation) {
        const movies = await this.fetchMovies(offset ?? this.currentlyLoaded);
        if (generation !== this.generation || !movies) {
            return;
        }
        this.movies.set(movies);
        this.movieCount.emit(this.movies().length);
    }

    private async loadTv(offset?: number, generation = this.generation) {
        const shows = await this.fetchTv(offset ?? this.currentlyLoaded);
        if (generation !== this.generation || !shows) {
            return;
        }
        this.tvShows.set(shows);
    }

    private fetchMovies(loadOffset: number): Promise<ISearchMovieResult[]> {
        switch (this.discoverType()) {
            case DiscoverType.Popular:
                return this.searchService.popularMoviesByPage(loadOffset, this.amountToLoad);
            case DiscoverType.Trending:
                return this.searchService.nowPlayingMoviesByPage(loadOffset, this.amountToLoad);
            case DiscoverType.Upcoming:
                return this.searchService.upcomingMoviesByPage(loadOffset, this.amountToLoad);
            case DiscoverType.RecentlyRequested:
                return this.searchService.recentlyRequestedMoviesByPage(loadOffset, this.amountToLoad);
            case DiscoverType.Seasonal:
                return this.searchService.seasonalMoviesByPage(loadOffset, this.amountToLoad);
        }
        return Promise.resolve(null);
    }

    private fetchTv(loadOffset: number): Promise<ISearchTvResult[]> {
        switch (this.discoverType()) {
            case DiscoverType.Popular:
                return this.searchService.popularTvByPage(loadOffset, this.amountToLoad);
            case DiscoverType.Trending:
                return this.searchService.trendingTvByPage(loadOffset, this.amountToLoad);
            case DiscoverType.Upcoming:
                return this.searchService.anticipatedTvByPage(loadOffset, this.amountToLoad);
            case DiscoverType.RecentlyRequested:
                // TODO need to do some more mapping for recently requested TV
                return Promise.resolve(null);
        }
        return Promise.resolve(null);
    }

    private createInitialModel(clearExisting: boolean = true) {
        if (clearExisting) {
            this.clear();
        }
        this.createModel();
    }

    private createModel() {
        const tempResults = <IDiscoverCardResult[]>[];

        switch (+this.discoverOptions()) {
            case DiscoverOption.Combined:
                tempResults.push(...this.mapMovieModel());
                tempResults.push(...this.mapTvModel());
                this.shuffle(tempResults);
                break;
            case DiscoverOption.Movie:
                tempResults.push(...this.mapMovieModel());
                break;
            case DiscoverOption.Tv:
                tempResults.push(...this.mapTvModel());
                break;
        }

        this.discoverResults.update(current => [...current, ...tempResults]);

        this.finishLoading();
    }

    private mapMovieModel(): IDiscoverCardResult[] {
        const tempResults = <IDiscoverCardResult[]>[];
        this.movies().forEach(m => {
            tempResults.push({
                available: m.available,
                posterPath: m.posterPath ? `https://image.tmdb.org/t/p/w500${m.posterPath}` : this.baseUrl + "/images/default_movie_poster.png",
                requested: m.requested,
                title: m.title,
                type: RequestType.movie,
                id: m.id,
                url: `http://www.imdb.com/title/${m.imdbId}/`,
                rating: m.voteAverage,
                overview: m.overview,
                approved: m.approved,
                imdbid: m.imdbId,
                denied: false,
                background: m.backdropPath
            });
        });
        return tempResults;
    }

    private mapTvModel(): IDiscoverCardResult[] {
        const tempResults = <IDiscoverCardResult[]>[];
        this.tvShows().forEach(m => {
            const poster = m.posterPath || m.backdropPath;
            tempResults.push({
                available: m.fullyAvailable || m.partlyAvailable,
                posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` :  this.baseUrl + "/images/default_tv_poster.png",
                requested: m.requested,
                title: m.title,
                type: RequestType.tvShow,
                id: m.id,
                url: undefined,
                rating: +m.rating,
                overview: m.overview,
                approved: m.approved || m.partlyAvailable,
                imdbid: m.imdbId,
                denied: false,
                background: m.backdropPath
            });
        });
        return tempResults;
    }

    private clear() {
        this.discoverResults.set([]);
    }

    private shuffle(discover: IDiscoverCardResult[]): IDiscoverCardResult[] {
        for (let i = discover.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [discover[i], discover[j]] = [discover[j], discover[i]];
        }
        return discover;
    }

    private loading() {
        this.loadingFlag.set(true);
    }

    private finishLoading() {
        this.loadingFlag.set(false);
    }
}
