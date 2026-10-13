import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    NgZone,
    OnDestroy,
    ViewChild,
    ViewEncapsulation,
    inject,
    input,
    output,
    signal,
} from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";

import { prefersReducedMotion } from "../../directives/reveal.directive";

/**
 * Horizontally scrolling, scroll-snapping row of media. Content is projected, and each
 * projected child should carry the `ombi-rail__item` class and role="listitem".
 *
 * Emits `nearEnd` when the user scrolls within ~1.5 viewports of the end so the host
 * can append another page. Hosts must guard against duplicate loads themselves.
 */
@Component({
    standalone: true,
    selector: "ombi-media-rail",
    templateUrl: "./media-rail.component.html",
    styleUrls: ["./media-rail.component.scss"],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TranslateModule],
})
export class MediaRailComponent implements AfterViewInit, OnDestroy {
    public readonly label = input<string>("");
    public readonly nearEnd = output<void>();

    @ViewChild("viewport", { static: true }) public viewport: ElementRef<HTMLElement>;
    @ViewChild("track", { static: true }) public track: ElementRef<HTMLElement>;

    public readonly canPrev = signal(false);
    public readonly canNext = signal(false);

    private readonly zone = inject(NgZone);
    private resizeObserver?: ResizeObserver;
    private mutationObserver?: MutationObserver;
    private frame = 0;

    public ngAfterViewInit(): void {
        const viewport = this.viewport.nativeElement;
        this.zone.runOutsideAngular(() => {
            viewport.addEventListener("scroll", this.onScroll, { passive: true });
            if (typeof ResizeObserver !== "undefined") {
                this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
                this.resizeObserver.observe(viewport);
            }
            if (typeof MutationObserver !== "undefined") {
                this.mutationObserver = new MutationObserver(() => this.scheduleMeasure());
                this.mutationObserver.observe(this.track.nativeElement, { childList: true });
            }
        });
        this.scheduleMeasure();
    }

    public ngOnDestroy(): void {
        this.viewport?.nativeElement.removeEventListener("scroll", this.onScroll);
        this.resizeObserver?.disconnect();
        this.mutationObserver?.disconnect();
        if (this.frame) {
            cancelAnimationFrame(this.frame);
        }
    }

    /** Scrolls roughly one viewport left (-1) or right (1), leaving a sliver of context. */
    public page(direction: -1 | 1): void {
        const viewport = this.viewport.nativeElement;
        viewport.scrollBy({
            left: direction * Math.max(viewport.clientWidth * 0.86, 160),
            behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
    }

    public scrollToStart(): void {
        const viewport = this.viewport?.nativeElement;
        if (!viewport || viewport.scrollLeft === 0) {
            return;
        }
        viewport.scrollTo({ left: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }

    private readonly onScroll = (): void => this.scheduleMeasure();

    private scheduleMeasure(): void {
        if (this.frame || typeof requestAnimationFrame === "undefined") {
            return;
        }
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.measure();
        });
    }

    private measure(): void {
        const viewport = this.viewport?.nativeElement;
        if (!viewport) {
            return;
        }
        const max = viewport.scrollWidth - viewport.clientWidth;
        const left = viewport.scrollLeft;
        const canPrev = left > 4;
        const canNext = left < max - 4;
        const nearEnd = viewport.clientWidth > 0 && max - left < viewport.clientWidth * 1.5;

        if (canPrev !== this.canPrev() || canNext !== this.canNext()) {
            this.zone.run(() => {
                this.canPrev.set(canPrev);
                this.canNext.set(canNext);
            });
        }
        if (nearEnd) {
            this.zone.run(() => this.nearEnd.emit());
        }
    }
}
