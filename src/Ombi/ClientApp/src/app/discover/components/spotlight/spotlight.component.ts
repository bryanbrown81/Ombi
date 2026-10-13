import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, input, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { AuthService } from "../../../auth/auth.service";
import { ISearchMovieResult } from "../../../interfaces";
import { SearchV2Service } from "../../../services";
import { InstantSearchController } from "../../../shared/instant-search/instant-search.controller";
import { SearchPanelComponent } from "../../../shared/instant-search/search-panel.component";
import { SearchShortcutService } from "../../../shared/instant-search/search-shortcut.service";
import { RevealDirective, prefersReducedMotion } from "../../directives/reveal.directive";

export interface ISpotlightItem {
    id: number;
    title: string;
    overview: string;
    year: string;
    rating: string;
    backdrop: string;
    backdropLarge: string;
}

const TMDB_IMAGE = "https://image.tmdb.org/t/p";
const WALL_ROWS = 3;

/**
 * Editorial design: a search-first hero over a slowly drifting wall of posters,
 * followed by a "Now Playing" bento grid.
 */
@Component({
    standalone: true,
    selector: "discover-spotlight",
    templateUrl: "./spotlight.component.html",
    styleUrls: ["./spotlight.component.scss", "./spotlight.bento.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [InstantSearchController],
    imports: [CommonModule, RouterModule, TranslateModule, SearchPanelComponent, RevealDirective],
})
export class SpotlightComponent implements OnInit, OnDestroy {
    /** Section number shown on the Now Playing header, e.g. "01". */
    public readonly featureIndex = input<string>("");

    @ViewChild("searchInput") public searchInput: ElementRef<HTMLInputElement>;

    public readonly ctrl = inject(InstantSearchController);
    public readonly wallRows = signal<string[][]>([]);
    public readonly featured = signal<ISpotlightItem[]>([]);
    public readonly trending = computed(() => this.featured().slice(0, 4));
    public readonly greetingKey = SpotlightComponent.greetingKeyFor(new Date().getHours());
    public readonly userName: string;

    private readonly searchService = inject(SearchV2Service);
    private readonly shortcuts = inject(SearchShortcutService);
    private unregisterShortcut?: () => void;

    constructor() {
        const auth = inject(AuthService);
        let name = "";
        try {
            name = auth.claims()?.name ?? "";
        } catch {
            name = "";
        }
        this.userName = name;
    }

    public static greetingKeyFor(hour: number): string {
        if (hour < 12) {
            return "Discovery.Spotlight.Morning";
        }
        if (hour < 18) {
            return "Discovery.Spotlight.Afternoon";
        }
        return "Discovery.Spotlight.Evening";
    }

    public static buildWall(posters: string[], rows = WALL_ROWS): string[][] {
        if (posters.length === 0) {
            return [];
        }
        const perRow = Math.max(6, Math.ceil(posters.length / rows));
        return Array.from({ length: rows }, (_, r) => {
            // Each row takes the next slice, wrapping when there are too few posters.
            const row = Array.from({ length: perRow }, (_, i) => posters[(r * perRow + i) % posters.length]);
            // Duplicate so a -50% translate loops seamlessly.
            return [...row, ...row];
        });
    }

    public async ngOnInit() {
        this.unregisterShortcut = this.shortcuts.register(() => this.tryFocus());

        const [nowPlaying, popular] = await Promise.allSettled([
            this.searchService.nowPlayingMoviesByPage(0, 20),
            this.searchService.popularMoviesByPage(0, 20),
        ]);
        const playing = nowPlaying.status === "fulfilled" ? nowPlaying.value ?? [] : [];
        const popularMovies = popular.status === "fulfilled" ? popular.value ?? [] : [];

        this.featured.set(playing.filter(m => m.backdropPath).slice(0, 5).map(m => this.toItem(m)));

        const seen = new Set<number>();
        const posters = [...popularMovies, ...playing]
            .filter(m => m.posterPath && !seen.has(m.id) && seen.add(m.id))
            .map(m => `${TMDB_IMAGE}/w185${m.posterPath}`);
        this.wallRows.set(SpotlightComponent.buildWall(posters));
    }

    public ngOnDestroy(): void {
        this.unregisterShortcut?.();
    }

    public onFocus(): void {
        this.ctrl.openPanel();
        this.makeRoomForResults();
    }

    public onKeydown(event: KeyboardEvent): void {
        const handled = this.ctrl.handleKeydown(event);
        if (!handled && event.key === "Escape") {
            this.searchInput?.nativeElement?.blur();
        }
    }

    public submit(): void {
        if (this.ctrl.term()) {
            this.ctrl.goToResults(this.ctrl.term());
        } else {
            this.searchInput?.nativeElement?.focus();
        }
    }

    public clear(): void {
        this.ctrl.setQuery("");
        this.searchInput?.nativeElement?.focus();
    }

    public markLoaded(event: Event): void {
        (event.target as HTMLElement)?.classList?.add("is-loaded");
    }

    /**
     * The results panel opens below the box; when the box sits low in the viewport, glide it
     * up under the top bar so the results have room instead of running off-screen.
     */
    private makeRoomForResults(): void {
        const field = this.searchInput?.nativeElement?.closest(".spot-search") as HTMLElement | null;
        if (!field || typeof window === "undefined") {
            return;
        }
        const rect = field.getBoundingClientRect();
        const roomBelow = window.innerHeight - rect.bottom;
        const targetTop = 88;
        if (roomBelow >= 440 || rect.top <= targetTop + 8) {
            return;
        }
        window.scrollBy({ top: rect.top - targetTop, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }

    /** Claims the global search shortcut while the big search box is on screen. */
    private tryFocus(): boolean {
        const input = this.searchInput?.nativeElement;
        if (!input) {
            return false;
        }
        const rect = input.getBoundingClientRect();
        const onScreen = rect.height > 0 && rect.bottom > 64 && rect.top < (window.innerHeight || 0);
        if (!onScreen) {
            return false;
        }
        input.focus();
        input.select();
        return true;
    }

    private toItem(m: ISearchMovieResult): ISpotlightItem {
        return {
            id: m.id,
            title: m.title,
            overview: m.overview,
            year: m.releaseDate ? new Date(m.releaseDate).getFullYear().toString() : "",
            rating: m.voteAverage ? (Math.round(m.voteAverage * 10) / 10).toString() : "",
            backdrop: `${TMDB_IMAGE}/w780${m.backdropPath}`,
            backdropLarge: `${TMDB_IMAGE}/w1280${m.backdropPath}`,
        };
    }
}
