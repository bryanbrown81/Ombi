import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslateModule } from "@ngx-translate/core";

import { SearchV2Service } from "../../../services";
import { RequestType } from "../../../interfaces";
import { AdvancedSearchDialogDataService } from "app/shared/advanced-search-dialog/advanced-search-dialog-data.service";
import { Router } from "@angular/router";
import { map } from "rxjs";

export interface IGenreSelect {
    name: string;
    id: number;
    type: "movie"|"tv";
}

// Keyed by TMDb genre id, which is stable across languages (names are localised).
const GENRE_STYLE: Record<number, { icon: string; hue: number }> = {
    28: { icon: "fa-bolt", hue: 12 },                       // Action
    12: { icon: "fa-compass", hue: 32 },                    // Adventure
    16: { icon: "fa-wand-magic-sparkles", hue: 290 },       // Animation
    35: { icon: "fa-face-laugh-beam", hue: 48 },            // Comedy
    80: { icon: "fa-user-secret", hue: 220 },               // Crime
    99: { icon: "fa-video", hue: 160 },                     // Documentary
    18: { icon: "fa-masks-theater", hue: 340 },             // Drama
    10751: { icon: "fa-people-roof", hue: 95 },             // Family
    14: { icon: "fa-dragon", hue: 265 },                    // Fantasy
    36: { icon: "fa-landmark", hue: 38 },                   // History
    27: { icon: "fa-ghost", hue: 0 },                       // Horror
    10402: { icon: "fa-music", hue: 310 },                  // Music
    9648: { icon: "fa-magnifying-glass", hue: 200 },        // Mystery
    10749: { icon: "fa-heart", hue: 345 },                  // Romance
    878: { icon: "fa-rocket", hue: 190 },                   // Science Fiction
    10770: { icon: "fa-tv", hue: 210 },                     // TV Movie
    53: { icon: "fa-eye", hue: 180 },                       // Thriller
    10752: { icon: "fa-person-military-rifle", hue: 80 },   // War
    37: { icon: "fa-hat-cowboy", hue: 28 },                 // Western
    10759: { icon: "fa-bolt", hue: 18 },                    // Action & Adventure
    10762: { icon: "fa-child-reaching", hue: 140 },         // Kids
    10763: { icon: "fa-newspaper", hue: 215 },              // News
    10764: { icon: "fa-camera", hue: 330 },                 // Reality
    10765: { icon: "fa-rocket", hue: 250 },                 // Sci-Fi & Fantasy
    10766: { icon: "fa-soap", hue: 300 },                   // Soap
    10767: { icon: "fa-microphone", hue: 170 },             // Talk
    10768: { icon: "fa-scale-balanced", hue: 60 },          // War & Politics
};

@Component({
    standalone: true,
    selector: "genre-button-select",
    templateUrl: "./genre-button-select.component.html",
    styleUrls: ["./genre-button-select.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        TranslateModule
    ]
})
export class GenreButtonSelectComponent implements OnInit {

    public movieGenreList = signal<IGenreSelect[]>(null);
    public tvGenreList = signal<IGenreSelect[]>(null);
    public mediaType = signal<"movie"|"tv">("movie");
    /** Genre whose results are being fetched; the chip shows a spinner meanwhile. */
    public pending = signal<IGenreSelect | null>(null);

    public genres = computed(() => this.mediaType() === "movie" ? this.movieGenreList() : this.tvGenreList());

    constructor(private searchService: SearchV2Service,
        private advancedSearchService: AdvancedSearchDialogDataService,
        private router: Router) { }

    public ngOnInit(): void {
        this.searchService.getGenres("movie").pipe(map(x => (x ?? []).map(y => ({ name: y.name, id: y.id, type: "movie" } as IGenreSelect))))
            .subscribe({
                next: x => this.movieGenreList.set(x),
                error: () => this.movieGenreList.set([]),
            });
        this.searchService.getGenres("tv").pipe(map(x => (x ?? []).map(y => ({ name: y.name, id: y.id, type: "tv" } as IGenreSelect))))
            .subscribe({
                next: x => this.tvGenreList.set(x),
                error: () => this.tvGenreList.set([]),
            });
    }

    public setMediaType(type: "movie"|"tv"): void {
        this.mediaType.set(type);
    }

    public iconFor(genre: IGenreSelect): string {
        return "fas " + (GENRE_STYLE[genre.id]?.icon ?? "fa-film");
    }

    public hueFor(genre: IGenreSelect): number {
        return GENRE_STYLE[genre.id]?.hue ?? 200;
    }

    public isPending(genre: IGenreSelect): boolean {
        const pending = this.pending();
        return !!pending && pending.id === genre.id && pending.type === genre.type;
    }

    public async selectGenre(genre: IGenreSelect) {
        if (this.pending()) {
            return;
        }
        this.pending.set(genre);
        const type = genre.type;
        const requestType = type == "movie" ? RequestType.movie : RequestType.tvShow;
        const genres: number[] = [genre.id];
        try {
            const data = await this.searchService.advancedSearch({
                watchProviders: [],
                genreIds: genres,
                keywordIds: [],
                type: type,
            }, 0, 30);

            this.advancedSearchService.setData(data, requestType, genre.name);
            this.advancedSearchService.setOptions([], genres, [], null, requestType, 30);
            await this.router.navigate([`discover/advanced/search`]);
        } catch (err) {
            console.warn("Discover: genre search failed", err);
        } finally {
            this.pending.set(null);
        }
    }
}
