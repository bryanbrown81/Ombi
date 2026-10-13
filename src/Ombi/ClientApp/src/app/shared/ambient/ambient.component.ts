import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, signal } from "@angular/core";
import { toObservable, takeUntilDestroyed } from "@angular/core/rxjs-interop";

import { AmbientService } from "./ambient.service";

interface IAmbientLayer {
    id: number;
    url: string;
}

const MAX_LAYERS = 3;

/**
 * The fixed, full-screen Aurora backdrop: drifting colour fields plus a heavily blurred copy of
 * whatever artwork the current page has claimed through AmbientService. Rendered once, behind
 * every page.
 */
@Component({
    standalone: true,
    selector: "ombi-ambient",
    templateUrl: "./ambient.component.html",
    styleUrls: ["./ambient.component.scss"],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AmbientComponent {
    private readonly ambient = inject(AmbientService);
    private nextId = 0;

    public readonly layers = signal<IAmbientLayer[]>([]);
    public readonly activeId = signal<number>(-1);
    private readonly loaded = signal<ReadonlySet<number>>(new Set());

    public readonly hasArtwork = computed(() => this.activeId() >= 0 && this.loaded().has(this.activeId()));

    constructor() {
        toObservable(this.ambient.image).pipe(takeUntilDestroyed()).subscribe(url => this.show(url));
    }

    public isActive(layer: IAmbientLayer): boolean {
        return layer.id === this.activeId() && this.loaded().has(layer.id);
    }

    public onLoad(layer: IAmbientLayer): void {
        this.loaded.update(set => new Set(set).add(layer.id));
    }

    private show(url: string | null): void {
        if (!url) {
            this.activeId.set(-1);
            return;
        }
        const current = this.layers().find(l => l.id === this.activeId());
        if (current?.url === url) {
            return;
        }
        // Reuse a layer that already holds this artwork so returning to it is instant.
        const existing = this.layers().find(l => l.url === url);
        if (existing) {
            this.activeId.set(existing.id);
            return;
        }
        const layer = { id: this.nextId++, url };
        this.layers.update(list => [...list, layer].slice(-MAX_LAYERS));
        this.activeId.set(layer.id);
    }
}
