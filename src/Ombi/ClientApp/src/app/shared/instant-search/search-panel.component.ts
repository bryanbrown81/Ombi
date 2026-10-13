import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslateModule } from "@ngx-translate/core";

import { INSTANT_SEARCH_MIN_CHARS, InstantSearchController } from "./instant-search.controller";

/**
 * The popup listbox for an instant-search combobox. Purely presentational: all state and
 * behaviour lives on the InstantSearchController passed in by the host search box.
 */
@Component({
    standalone: true,
    selector: "ombi-search-panel",
    templateUrl: "./search-panel.component.html",
    styleUrls: ["./search-panel.component.scss", "./search-panel.designs.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, TranslateModule],
})
export class SearchPanelComponent {
    public readonly ctrl = input.required<InstantSearchController>();
    public readonly variant = input<"nav" | "hero">("nav");
    public readonly minChars = INSTANT_SEARCH_MIN_CHARS;
    public readonly isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

    /** Keep focus in the input while the pointer interacts with the panel. */
    public keepFocus(event: MouseEvent): void {
        event.preventDefault();
    }
}
