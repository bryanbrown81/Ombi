import { Component, computed, inject, signal, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslateModule } from "@ngx-translate/core";

import { AuthService } from "../../../auth/auth.service";
import { DiscoverType } from "../carousel-list/carousel-list.component";
import { GenreButtonSelectComponent } from "../genre/genre-button-select.component";
import { RecentlyRequestedListComponent } from "../recently-requested-list/recently-requested-list.component";
import { CarouselListComponent } from "../carousel-list/carousel-list.component";
import { HeroBannerComponent } from "../hero-banner/hero-banner.component";
import { SpotlightComponent } from "../spotlight/spotlight.component";
import { DesignSwitcherComponent } from "../design-switcher/design-switcher.component";
import { DiscoverDesignService } from "../../services/discover-design.service";
import { RevealDirective } from "../../directives/reveal.directive";

type SectionId = "featured" | "genres" | "recent" | "seasonal" | "popular" | "trending" | "upcoming";

@Component({
    standalone: true,
    templateUrl: "./discover.component.html",
    styleUrls: ["./discover.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        TranslateModule,
        GenreButtonSelectComponent,
        RecentlyRequestedListComponent,
        CarouselListComponent,
        HeroBannerComponent,
        SpotlightComponent,
        DesignSwitcherComponent,
        RevealDirective
    ]
})
export class DiscoverComponent {
    // Services using inject() function
    private authService = inject(AuthService);
    private designService = inject(DiscoverDesignService);

    // Public constants
    public DiscoverType = DiscoverType;

    // State using signals
    public isAdmin = signal<boolean>(false);
    public seasonalMovieCount = signal<number>(0);
    public hasRecentRequests = signal<boolean>(true);
    public design = this.designService.design;

    // Computed properties
    public showSeasonal = computed(() => this.seasonalMovieCount() > 0);
    /** The design switcher is a preview tool: admins always see it, anyone can via ?design=. */
    public showDesignSwitcher = computed(() => this.isAdmin() || this.designService.requestedViaUrl);

    /** Visible sections in order, used for the Editorial design's numbered headings. */
    private sectionOrder = computed<SectionId[]>(() => {
        const ids: SectionId[] = [];
        if (this.design() === "editorial") {
            ids.push("featured");
        }
        ids.push("genres");
        if (this.hasRecentRequests()) {
            ids.push("recent");
        }
        if (this.showSeasonal()) {
            ids.push("seasonal");
        }
        ids.push("popular", "trending", "upcoming");
        return ids;
    });

    constructor() {
        // Initialize admin status
        this.isAdmin.set(this.authService.isAdmin());
    }

    public setSeasonalMovieCount(count: number): void {
        this.seasonalMovieCount.set(count);
    }

    public sectionIndex(id: SectionId): string {
        const index = this.sectionOrder().indexOf(id);
        return index < 0 ? "" : String(index + 1).padStart(2, "0");
    }
}
