import { Component, Input, OnDestroy, Optional } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DomSanitizer, SafeStyle } from "@angular/platform-browser";
import { AmbientService } from "../../../../shared/ambient/ambient.service";

@Component({
        standalone: true,
    selector: "top-banner",
    templateUrl: "./top-banner.component.html",
    styleUrls: ["top-banner.component.scss"],
    imports: [
        CommonModule
    ]
})
export class TopBannerComponent implements OnDestroy {
    @Input() title: string;
    @Input() releaseDate: Date;
    @Input() tagline: string;
    @Input() available: boolean;
    @Input() background: any;

    /**
     * Artwork that tints the app-wide ambient backdrop while this page is open:
     * a TMDb image path (e.g. "/abc.jpg") or a full URL.
     */
    @Input() set ambient(value: string | null | undefined) {
        this.ambientService?.set(this, TopBannerComponent.ambientUrl(value));
    }

    public static ambientUrl(value: string | null | undefined): string | null {
        if (!value) {
            return null;
        }
        if (/^https?:\/\//i.test(value)) {
            return value;
        }
        return `https://image.tmdb.org/t/p/w300${value.startsWith("/") ? "" : "/"}${value}`;
    }

    get releaseDateFormat(): Date|null {
        if (this.releaseDate && this.releaseDate instanceof Date && this.releaseDate.getFullYear() !== 1) {
            return this.releaseDate;
        }
        return null;
    }

    constructor(private sanitizer: DomSanitizer, @Optional() private ambientService?: AmbientService) { }

    public ngOnDestroy(): void {
        this.ambientService?.release(this);
    }

    public getBackgroundImage(): SafeStyle {
        return this.sanitizer.bypassSecurityTrustStyle(this.background);
    }
}
