import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from "@angular/core";

export function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/**
 * Fades and lifts an element in the first time it scrolls into view.
 * Elements stay fully visible when IntersectionObserver is unavailable or the
 * user prefers reduced motion. Styles live in styles/discover.scss.
 */
@Directive({
    standalone: true,
    selector: "[ombiReveal]",
})
export class RevealDirective implements OnInit, OnDestroy {
    public readonly revealDelay = input<number>(0);

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private observer?: IntersectionObserver;

    public ngOnInit(): void {
        const node = this.host.nativeElement;
        if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
            return;
        }

        node.classList.add("au-reveal");
        node.style.setProperty("--au-reveal-delay", `${this.revealDelay()}ms`);

        this.observer = new IntersectionObserver(entries => {
            if (!entries.some(e => e.isIntersecting)) {
                return;
            }
            this.observer?.disconnect();
            node.classList.add("au-reveal--in");
            // Drop the helper classes once settled so no transform lingers on the element.
            const settle = (event: TransitionEvent) => {
                if (event.target !== node || event.propertyName !== "transform") {
                    return;
                }
                node.removeEventListener("transitionend", settle);
                node.classList.remove("au-reveal", "au-reveal--in");
                node.style.removeProperty("--au-reveal-delay");
            };
            node.addEventListener("transitionend", settle);
        }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });

        this.observer.observe(node);
    }

    public ngOnDestroy(): void {
        this.observer?.disconnect();
    }
}
