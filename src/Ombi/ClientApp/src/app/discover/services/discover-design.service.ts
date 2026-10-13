import { DOCUMENT } from "@angular/common";
import { Injectable, inject, signal } from "@angular/core";

export type DiscoverDesign = "cinema" | "editorial" | "aurora";

export interface IDiscoverDesignOption {
    id: DiscoverDesign;
    labelKey: string;
    icon: string;
}

export const DISCOVER_DESIGNS: IDiscoverDesignOption[] = [
    { id: "cinema", labelKey: "Discovery.Designs.Cinema", icon: "fas fa-film" },
    { id: "editorial", labelKey: "Discovery.Designs.Editorial", icon: "fas fa-newspaper" },
    { id: "aurora", labelKey: "Discovery.Designs.Aurora", icon: "fas fa-wand-magic-sparkles" },
];

const STORAGE_KEY = "discoverDesign";
const QUERY_PARAM = "design";
const DEFAULT_DESIGN: DiscoverDesign = "cinema";

export function isDiscoverDesign(value: unknown): value is DiscoverDesign {
    return DISCOVER_DESIGNS.some(d => d.id === value);
}

/**
 * Holds the active Discover design. The value is mirrored onto
 * <html data-discover-design="..."> so every discover surface (the page, the
 * nav search panel and the results page) can theme itself from CSS tokens.
 */
@Injectable({ providedIn: "root" })
export class DiscoverDesignService {
    private readonly document = inject(DOCUMENT);

    /** True when the design was forced via ?design=, which also reveals the switcher. */
    public readonly requestedViaUrl: boolean;
    public readonly design = signal<DiscoverDesign>(DEFAULT_DESIGN);

    constructor() {
        const fromUrl = this.readQueryParam();
        this.requestedViaUrl = fromUrl !== null;
        const initial = fromUrl ?? this.readStored() ?? DEFAULT_DESIGN;
        if (fromUrl) {
            this.persist(fromUrl);
        }
        this.apply(initial);
    }

    public setDesign(design: DiscoverDesign): void {
        if (!isDiscoverDesign(design) || design === this.design()) {
            return;
        }
        this.persist(design);
        this.apply(design);
    }

    private apply(design: DiscoverDesign): void {
        this.design.set(design);
        this.document?.documentElement?.setAttribute("data-discover-design", design);
    }

    private readQueryParam(): DiscoverDesign | null {
        try {
            const value = new URLSearchParams(this.document?.location?.search ?? "").get(QUERY_PARAM);
            return isDiscoverDesign(value) ? value : null;
        } catch {
            return null;
        }
    }

    private readStored(): DiscoverDesign | null {
        try {
            const value = localStorage.getItem(STORAGE_KEY);
            return isDiscoverDesign(value) ? value : null;
        } catch {
            return null;
        }
    }

    private persist(design: DiscoverDesign): void {
        try {
            localStorage.setItem(STORAGE_KEY, design);
        } catch {
            // Storage can be unavailable (private mode); the in-memory value still applies.
        }
    }
}
