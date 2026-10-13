import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { SearchV2Service } from "../../../services";
import { RequestType } from "../../../interfaces";
import { TiltDirective } from "../../directives/tilt.directive";
import { AmbientService } from "../../../shared/ambient/ambient.service";
import { IMediaServerLink, getMediaServerLink } from "../../media-server";
import { prefersReducedMotion } from "../../directives/reveal.directive";

export interface IHeroBannerItem {
    id: number;
    title: string;
    overview: string;
    backdropPath: string;
    posterPath?: string;
    rating: number;
    type: RequestType;
    year: string;
    available?: boolean;
    approved?: boolean;
    requested?: boolean;
    plexUrl?: string;
    embyUrl?: string;
    jellyfinUrl?: string;
}

export const HERO_ROTATION_MS = 8000;
const TMDB_IMAGE = "https://image.tmdb.org/t/p";
const SWIPE_THRESHOLD_PX = 48;

@Component({
    standalone: true,
    selector: "discover-hero-banner",
    templateUrl: "./hero-banner.component.html",
    styleUrls: ["./hero-banner.component.scss", "./hero-banner.stage.scss", "./hero-banner.availability.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        RouterModule,
        TranslateModule,
        TiltDirective
    ]
})
export class HeroBannerComponent implements OnInit, OnDestroy {
    private readonly searchService = inject(SearchV2Service);
    private readonly ambient = inject(AmbientService);

    public readonly rotationMs = HERO_ROTATION_MS;

    public items = signal<IHeroBannerItem[]>([]);
    public activeIndex = signal<number>(0);
    /** The slide that is fading out, kept so its Ken Burns motion does not snap back mid-fade. */
    public previousIndex = signal<number>(-1);
    public loaded = signal<boolean>(false);
    public failed = signal<boolean>(false);
    public paused = signal<boolean>(false);
    public hovering = signal<boolean>(false);
    /** Bumped whenever the countdown restarts so the progress bar animation restarts with it. */
    public cycle = signal<number>(0);

    public activeItem = computed(() => {
        const list = this.items();
        if (list.length === 0) return null;
        return list[this.activeIndex()];
    });

    /** Single-element list keyed by id so the copy block re-mounts (and re-animates) per slide. */
    public activeItems = computed(() => {
        const item = this.activeItem();
        return item ? [item] : [];
    });

    public backdropUrl = computed(() => {
        const item = this.activeItem();
        if (!item || !item.backdropPath) return '';
        return `${TMDB_IMAGE}/w1280${item.backdropPath}`;
    });

    public rotationHalted = computed(() => this.paused() || this.hovering());

    private rotationTimer: ReturnType<typeof setTimeout> | null = null;
    private remainingMs = HERO_ROTATION_MS;
    private timerStartedAt = 0;
    private pointerStart: { x: number; y: number } | null = null;

    async ngOnInit() {
        try {
            const movies = await this.searchService.nowPlayingMoviesByPage(0, 5);
            const bannerItems: IHeroBannerItem[] = movies
                .filter(m => m.backdropPath)
                .slice(0, 5)
                .map(m => ({
                    id: m.id,
                    title: m.title,
                    overview: m.overview,
                    backdropPath: m.backdropPath,
                    posterPath: m.posterPath,
                    rating: m.voteAverage,
                    type: RequestType.movie,
                    year: m.releaseDate ? new Date(m.releaseDate).getFullYear().toString() : '',
                    available: m.available,
                    approved: m.approved,
                    requested: m.requested,
                    plexUrl: m.plexUrl,
                    embyUrl: m.embyUrl,
                    jellyfinUrl: m.jellyfinUrl
                }));

            this.items.set(bannerItems);
            this.loaded.set(true);
            this.failed.set(bannerItems.length === 0);
            this.syncAmbient();

            if (bannerItems.length > 1) {
                if (!prefersReducedMotion()) {
                    this.startRotation();
                } else {
                    this.paused.set(true);
                }
            }
            if (typeof document !== "undefined") {
                document.addEventListener("visibilitychange", this.onVisibilityChange);
            }
        } catch (err) {
            this.failed.set(true);
            console.warn('HeroBanner: failed to load trending movies', err);
        }
    }

    ngOnDestroy() {
        this.stopRotation();
        this.ambient.release(this);
        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.onVisibilityChange);
        }
    }

    public selectItem(index: number): void {
        const length = this.items().length;
        if (index < 0 || index >= length || index === this.activeIndex()) {
            return;
        }
        this.previousIndex.set(this.activeIndex());
        this.activeIndex.set(index);
        this.syncAmbient();
        // Every slide gets a full interval, measured from when it appeared.
        this.startRotation();
    }

    public next(): void {
        const length = this.items().length;
        if (length > 1) {
            this.selectItem((this.activeIndex() + 1) % length);
        }
    }

    public previous(): void {
        const length = this.items().length;
        if (length > 1) {
            this.selectItem((this.activeIndex() - 1 + length) % length);
        }
    }

    public togglePause(): void {
        if (this.paused()) {
            this.paused.set(false);
            this.resumeRotation();
        } else {
            this.paused.set(true);
            this.suspendRotation();
        }
    }

    public setHovering(hovering: boolean): void {
        if (this.hovering() === hovering) {
            return;
        }
        this.hovering.set(hovering);
        if (hovering) {
            this.suspendRotation();
        } else {
            this.resumeRotation();
        }
    }

    public onFocusOut(event: FocusEvent): void {
        const host = event.currentTarget as HTMLElement;
        const next = event.relatedTarget as Node | null;
        if (!next || !host?.contains(next)) {
            this.setHovering(false);
        }
    }

    public onPickerKeydown(event: KeyboardEvent): void {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
        }
        event.preventDefault();
        if (event.key === "ArrowRight") {
            this.next();
        } else {
            this.previous();
        }
        const picker = (event.currentTarget as HTMLElement)?.parentElement;
        const buttons = picker?.querySelectorAll<HTMLElement>("[data-hero-index]");
        buttons?.[this.activeIndex()]?.focus();
    }

    public onPointerDown(event: PointerEvent): void {
        if (event.pointerType === "mouse") {
            return;
        }
        this.pointerStart = { x: event.clientX, y: event.clientY };
    }

    public onPointerUp(event: PointerEvent): void {
        const start = this.pointerStart;
        this.pointerStart = null;
        if (!start) {
            return;
        }
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
            if (dx < 0) {
                this.next();
            } else {
                this.previous();
            }
        }
    }

    public backdropFor(item: IHeroBannerItem): string {
        return item?.backdropPath ? `${TMDB_IMAGE}/w1280${item.backdropPath}` : '';
    }

    public thumbFor(item: IHeroBannerItem): string {
        return item?.backdropPath ? `${TMDB_IMAGE}/w300${item.backdropPath}` : '';
    }

    public posterFor(item: IHeroBannerItem): string {
        return item?.posterPath ? `${TMDB_IMAGE}/w500${item.posterPath}` : '';
    }

    /** The media server holding this slide's title, if any (Plex, then Emby, then Jellyfin). */
    public serverFor(item: IHeroBannerItem): IMediaServerLink | null {
        return getMediaServerLink(item);
    }

    public getDetailsLink(): string {
        const item = this.activeItem();
        if (!item) return '/';
        return `/details/movie/${item.id}`;
    }

    public getRatingDisplay(): string {
        const item = this.activeItem();
        if (!item) return '';
        return (Math.round(item.rating * 10) / 10).toString();
    }

    /** Tints the app-wide ambient backdrop with the active slide's artwork. */
    private syncAmbient(): void {
        const item = this.activeItem();
        this.ambient.set(this, item ? this.thumbFor(item) : null);
    }

    /** Starts a fresh interval for the current slide. */
    private startRotation(): void {
        this.stopRotation();
        this.remainingMs = HERO_ROTATION_MS;
        this.cycle.update(c => c + 1);
        this.resumeRotation();
    }

    private resumeRotation(): void {
        this.clearTimer();
        if (this.paused() || this.hovering() || this.items().length < 2) {
            return;
        }
        if (typeof document !== "undefined" && document.hidden) {
            return;
        }
        this.timerStartedAt = Date.now();
        this.rotationTimer = setTimeout(() => {
            this.rotationTimer = null;
            this.next();
        }, this.remainingMs);
    }

    /** Freezes the countdown, remembering how much of the interval is left. */
    private suspendRotation(): void {
        if (!this.rotationTimer) {
            return;
        }
        this.clearTimer();
        this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.timerStartedAt));
    }

    private stopRotation(): void {
        this.clearTimer();
        this.remainingMs = HERO_ROTATION_MS;
    }

    private clearTimer(): void {
        if (this.rotationTimer) {
            clearTimeout(this.rotationTimer);
            this.rotationTimer = null;
        }
    }

    private readonly onVisibilityChange = (): void => {
        if (document.hidden) {
            this.suspendRotation();
        } else if (!this.paused()) {
            // CSS animations keep running against the document timeline while the tab is hidden,
            // so restart the slide's countdown to keep the progress bar honest.
            this.startRotation();
        }
    };
}
