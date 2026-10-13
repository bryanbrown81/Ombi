import { Injectable, signal } from "@angular/core";

/**
 * Drives the app-wide Aurora ambient wash. A page "claims" the ambient with an artwork URL
 * (e.g. the hero backdrop or a details page backdrop); the wash cross-fades to its colours.
 * Ownership stops a page that is leaving from clearing the artwork the next page just set.
 */
@Injectable({ providedIn: "root" })
export class AmbientService {
    private readonly _image = signal<string | null>(null);
    private owner: unknown = null;

    public readonly image = this._image.asReadonly();

    public set(owner: unknown, url: string | null | undefined): void {
        this.owner = owner;
        this._image.set(url || null);
    }

    /** Clears the artwork, but only if `owner` still holds it. */
    public release(owner: unknown): void {
        if (this.owner !== owner) {
            return;
        }
        this.owner = null;
        this._image.set(null);
    }
}
