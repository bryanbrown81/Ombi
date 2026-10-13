import { describe, it, expect } from 'vitest';
import { AmbientService } from './ambient.service';

describe('AmbientService', () => {
  it('starts without artwork', () => {
    expect(new AmbientService().image()).toBeNull();
  });

  it('sets artwork for an owner and treats empty urls as none', () => {
    const service = new AmbientService();
    service.set('hero', 'https://img/a.jpg');
    expect(service.image()).toBe('https://img/a.jpg');
    service.set('hero', '');
    expect(service.image()).toBeNull();
  });

  it('only lets the current owner release the artwork', () => {
    const service = new AmbientService();
    service.set('discover', 'https://img/a.jpg');
    service.set('details', 'https://img/b.jpg');

    service.release('discover'); // the page that left must not clear the new page's artwork
    expect(service.image()).toBe('https://img/b.jpg');

    service.release('details');
    expect(service.image()).toBeNull();
  });
});
