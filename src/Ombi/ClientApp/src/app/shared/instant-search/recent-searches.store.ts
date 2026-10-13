import { Injectable, signal } from "@angular/core";

const STORAGE_KEY = "discoverRecentSearches";
const MAX_ITEMS = 6;

/** Recently searched terms, shared by every search box and persisted to localStorage. */
@Injectable({ providedIn: "root" })
export class RecentSearchesStore {
    public readonly items = signal<string[]>(RecentSearchesStore.read());

    public add(term: string): void {
        const value = (term ?? "").trim();
        if (value.length < 2) {
            return;
        }
        const lower = value.toLowerCase();
        const next = [value, ...this.items().filter(t => t.toLowerCase() !== lower)].slice(0, MAX_ITEMS);
        this.write(next);
    }

    public remove(term: string): void {
        this.write(this.items().filter(t => t !== term));
    }

    public clear(): void {
        this.write([]);
    }

    private write(items: string[]): void {
        this.items.set(items);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // Storage may be unavailable (private mode); the in-memory list still works.
        }
    }

    private static read(): string[] {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
            return Array.isArray(parsed) ? parsed.filter(t => typeof t === "string").slice(0, MAX_ITEMS) : [];
        } catch {
            return [];
        }
    }
}
