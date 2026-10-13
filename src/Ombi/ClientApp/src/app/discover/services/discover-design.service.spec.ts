import { describe, it, expect, beforeEach } from 'vitest';
import { Injector } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DiscoverDesignService, isDiscoverDesign } from './discover-design.service';

function createService(search = '') {
  const doc = { location: { search }, documentElement: document.documentElement } as unknown as Document;
  const injector = Injector.create({
    providers: [
      { provide: DOCUMENT, useValue: doc },
      { provide: DiscoverDesignService, useClass: DiscoverDesignService, deps: [] },
    ],
  });
  return injector.get(DiscoverDesignService);
}

describe('DiscoverDesignService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-discover-design');
  });

  it('defaults to the cinema design and mirrors it onto <html>', () => {
    const service = createService();
    expect(service.design()).toBe('cinema');
    expect(service.requestedViaUrl).toBe(false);
    expect(document.documentElement.getAttribute('data-discover-design')).toBe('cinema');
  });

  it('restores the stored design', () => {
    localStorage.setItem('discoverDesign', 'editorial');
    expect(createService().design()).toBe('editorial');
  });

  it('prefers ?design= over storage and persists it', () => {
    localStorage.setItem('discoverDesign', 'editorial');
    const service = createService('?design=aurora');
    expect(service.design()).toBe('aurora');
    expect(service.requestedViaUrl).toBe(true);
    expect(localStorage.getItem('discoverDesign')).toBe('aurora');
  });

  it('ignores unknown values from the url and storage', () => {
    localStorage.setItem('discoverDesign', 'neon');
    const service = createService('?design=retro');
    expect(service.design()).toBe('cinema');
    expect(service.requestedViaUrl).toBe(false);
  });

  it('setDesign updates the signal, attribute and storage', () => {
    const service = createService();
    service.setDesign('aurora');
    expect(service.design()).toBe('aurora');
    expect(document.documentElement.getAttribute('data-discover-design')).toBe('aurora');
    expect(localStorage.getItem('discoverDesign')).toBe('aurora');
  });

  it('setDesign ignores invalid designs', () => {
    const service = createService();
    service.setDesign('neon' as any);
    expect(service.design()).toBe('cinema');
  });

  it('isDiscoverDesign recognises the three designs only', () => {
    expect(isDiscoverDesign('cinema')).toBe(true);
    expect(isDiscoverDesign('editorial')).toBe(true);
    expect(isDiscoverDesign('aurora')).toBe(true);
    expect(isDiscoverDesign('other')).toBe(false);
    expect(isDiscoverDesign(null)).toBe(false);
  });
});
