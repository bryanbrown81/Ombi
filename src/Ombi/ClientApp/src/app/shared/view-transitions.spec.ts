import { describe, it, expect, vi } from 'vitest';
import { skipSameRouteTransitions } from './view-transitions';

function snapshot(routeConfig: object) {
  // root -> child -> leaf, mirroring the router's snapshot tree
  const leaf = { routeConfig, firstChild: null };
  return { routeConfig: null, firstChild: { routeConfig: null, firstChild: leaf } } as any;
}

describe('skipSameRouteTransitions', () => {
  it('skips the transition when only params change on the same route', () => {
    const results = { path: 'discover/:searchTerm' };
    const transition = { skipTransition: vi.fn() };
    skipSameRouteTransitions({ transition, from: snapshot(results), to: snapshot(results) } as any);
    expect(transition.skipTransition).toHaveBeenCalled();
  });

  it('keeps the transition between different pages', () => {
    const transition = { skipTransition: vi.fn() };
    skipSameRouteTransitions({
      transition,
      from: snapshot({ path: 'discover' }),
      to: snapshot({ path: 'details/movie/:movieDbId' }),
    } as any);
    expect(transition.skipTransition).not.toHaveBeenCalled();
  });
});
