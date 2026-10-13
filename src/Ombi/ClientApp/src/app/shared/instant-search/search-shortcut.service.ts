import { Injectable } from "@angular/core";

/**
 * Lets search boxes claim the global "/" and Ctrl/Cmd+K shortcuts. The most recently
 * registered target that reports it can take focus (e.g. because it is on screen) wins;
 * the nav search falls back to itself when nobody claims it.
 */
@Injectable({ providedIn: "root" })
export class SearchShortcutService {
    private targets: Array<() => boolean> = [];

    /** Registers a focus callback; returns an unregister function. */
    public register(tryFocus: () => boolean): () => void {
        this.targets = [tryFocus, ...this.targets];
        return () => {
            this.targets = this.targets.filter(t => t !== tryFocus);
        };
    }

    public focusPreferred(): boolean {
        return this.targets.some(tryFocus => tryFocus());
    }

    /** True for "/" (outside editable fields) and Ctrl/Cmd+K. */
    public static isShortcut(event: KeyboardEvent): boolean {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key?.toLowerCase() === "k") {
            return true;
        }
        if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        return !(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable);
    }
}
