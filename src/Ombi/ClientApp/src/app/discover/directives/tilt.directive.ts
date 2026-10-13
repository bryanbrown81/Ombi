import { Directive, ElementRef, NgZone, OnDestroy, effect, inject, input } from "@angular/core";

import { prefersReducedMotion } from "./reveal.directive";

/**
 * Pointer-follow 3D tilt. Writes --tilt-x / --tilt-y (-1..1) and --glare-x / --glare-y (%)
 * onto the host so the stylesheet decides how much to rotate and where the glare sits.
 * Listeners run outside Angular so pointer movement never triggers change detection.
 *
 * Bind `[ombiTilt]="false"` to switch it off.
 */
@Directive({
    standalone: true,
    selector: "[ombiTilt]",
})
export class TiltDirective implements OnDestroy {
    public readonly ombiTilt = input<boolean | "">(true);

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly zone = inject(NgZone);
    private frame = 0;
    private attached = false;

    constructor() {
        effect(() => {
            // A bare `ombiTilt` attribute binds "", which means enabled.
            const enabled = this.ombiTilt() !== false;
            if (enabled && this.supportsTilt()) {
                this.attach();
            } else {
                this.detach();
            }
        });
    }

    public ngOnDestroy(): void {
        this.detach();
    }

    private supportsTilt(): boolean {
        return typeof window !== "undefined"
            && !!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches
            && !prefersReducedMotion();
    }

    private attach(): void {
        if (this.attached) {
            return;
        }
        this.attached = true;
        const node = this.host.nativeElement;
        this.zone.runOutsideAngular(() => {
            node.addEventListener("pointermove", this.onMove);
            node.addEventListener("pointerleave", this.onLeave);
        });
    }

    private detach(): void {
        if (!this.attached) {
            return;
        }
        this.attached = false;
        const node = this.host.nativeElement;
        node.removeEventListener("pointermove", this.onMove);
        node.removeEventListener("pointerleave", this.onLeave);
        this.onLeave();
    }

    private readonly onMove = (event: PointerEvent): void => {
        const node = this.host.nativeElement;
        const { clientX, clientY } = event;
        if (this.frame) {
            return;
        }
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) {
                return;
            }
            const px = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
            const py = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
            node.style.setProperty("--tilt-x", ((px - 0.5) * 2).toFixed(3));
            node.style.setProperty("--tilt-y", ((py - 0.5) * 2).toFixed(3));
            node.style.setProperty("--glare-x", `${(px * 100).toFixed(1)}%`);
            node.style.setProperty("--glare-y", `${(py * 100).toFixed(1)}%`);
            node.classList.add("is-tilting");
        });
    };

    private readonly onLeave = (): void => {
        const node = this.host.nativeElement;
        if (this.frame) {
            cancelAnimationFrame(this.frame);
            this.frame = 0;
        }
        node.classList.remove("is-tilting");
        node.style.removeProperty("--tilt-x");
        node.style.removeProperty("--tilt-y");
        node.style.removeProperty("--glare-x");
        node.style.removeProperty("--glare-y");
    };
}
