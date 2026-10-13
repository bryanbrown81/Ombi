import { ApplicationRef, ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { TranslateModule } from "@ngx-translate/core";

import { DISCOVER_DESIGNS, DiscoverDesign, DiscoverDesignService } from "../../services/discover-design.service";
import { prefersReducedMotion } from "../../directives/reveal.directive";

const COLLAPSED_KEY = "discoverDesignSwitcherCollapsed";

/** Floating control for previewing the Discover designs side by side. */
@Component({
    standalone: true,
    selector: "discover-design-switcher",
    templateUrl: "./design-switcher.component.html",
    styleUrls: ["./design-switcher.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, TranslateModule],
})
export class DesignSwitcherComponent {
    private readonly designService = inject(DiscoverDesignService);
    private readonly appRef = inject(ApplicationRef);
    private readonly document = inject(DOCUMENT);

    public readonly designs = DISCOVER_DESIGNS;
    public readonly design = this.designService.design;
    public readonly activeIndex = computed(() => Math.max(0, this.designs.findIndex(d => d.id === this.design())));
    public readonly collapsed = signal<boolean>(DesignSwitcherComponent.readCollapsed());

    public select(design: DiscoverDesign): void {
        if (design === this.design()) {
            return;
        }
        const doc = this.document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
            this.designService.setDesign(design);
            return;
        }
        // Cross-fade the whole page between designs; tick() renders the new design synchronously
        // so the browser captures the finished state.
        doc.startViewTransition(() => {
            this.designService.setDesign(design);
            this.appRef.tick();
        });
    }

    public setCollapsed(collapsed: boolean): void {
        this.collapsed.set(collapsed);
        try {
            localStorage.setItem(COLLAPSED_KEY, String(collapsed));
        } catch {
            // Non-critical preference.
        }
    }

    private static readCollapsed(): boolean {
        try {
            return localStorage.getItem(COLLAPSED_KEY) === "true";
        } catch {
            return false;
        }
    }
}
