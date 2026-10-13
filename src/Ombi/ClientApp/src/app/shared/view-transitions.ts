import { ActivatedRouteSnapshot, ViewTransitionInfo } from "@angular/router";

function deepest(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let current = snapshot;
    while (current?.firstChild) {
        current = current.firstChild;
    }
    return current;
}

/**
 * Only animate navigations between different pages. Param-only navigations on the same
 * route (e.g. the results page updating as you type) stay instant so input is never blocked.
 */
export function skipSameRouteTransitions({ transition, from, to }: ViewTransitionInfo): void {
    if (deepest(from)?.routeConfig === deepest(to)?.routeConfig) {
        transition.skipTransition();
    }
}
