import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopBannerComponent } from './top-banner.component';
import { AmbientService } from '../../../../shared/ambient/ambient.service';

describe('TopBannerComponent', () => {
  function createComponent() {
    const mockSanitizer = {
      bypassSecurityTrustStyle: vi.fn((val: string) => `safe-style:${val}`),
    } as any;

    const comp = new TopBannerComponent(mockSanitizer);
    return { comp, mockSanitizer };
  }

  describe('releaseDateFormat', () => {
    it('should return the date when it is a valid date with year != 1', () => {
      const { comp } = createComponent();
      const date = new Date(2023, 5, 15);
      comp.releaseDate = date;
      expect(comp.releaseDateFormat).toBe(date);
    });

    it('should return null when releaseDate is falsy', () => {
      const { comp } = createComponent();
      comp.releaseDate = null as any;
      expect(comp.releaseDateFormat).toBeNull();
    });

    it('should return null when releaseDate year is 1 (default/min date)', () => {
      const { comp } = createComponent();
      const minDate = new Date();
      minDate.setFullYear(1, 0, 1);
      comp.releaseDate = minDate;
      expect(comp.releaseDateFormat).toBeNull();
    });

    it('should return null when releaseDate is not a Date instance', () => {
      const { comp } = createComponent();
      comp.releaseDate = '2023-06-15' as any;
      expect(comp.releaseDateFormat).toBeNull();
    });
  });

  describe('getBackgroundImage', () => {
    it('should call bypassSecurityTrustStyle with the background value', () => {
      const { comp, mockSanitizer } = createComponent();
      comp.background = 'url(https://image.tmdb.org/test.jpg)';
      const result = comp.getBackgroundImage();
      expect(mockSanitizer.bypassSecurityTrustStyle).toHaveBeenCalledWith('url(https://image.tmdb.org/test.jpg)');
      expect(result).toBe('safe-style:url(https://image.tmdb.org/test.jpg)');
    });
  });

  describe('ambient backdrop', () => {
    it('builds TMDb thumbnails from image paths and passes full urls through', () => {
      expect(TopBannerComponent.ambientUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg');
      expect(TopBannerComponent.ambientUrl('abc.jpg')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg');
      expect(TopBannerComponent.ambientUrl('https://fanart.tv/a.jpg')).toBe('https://fanart.tv/a.jpg');
      expect(TopBannerComponent.ambientUrl(null)).toBeNull();
    });

    it('tints the ambient while open and releases it when destroyed', () => {
      const ambient = new AmbientService();
      const comp = new TopBannerComponent({ bypassSecurityTrustStyle: (v: string) => v } as any, ambient);
      comp.ambient = '/backdrop.jpg';
      expect(ambient.image()).toBe('https://image.tmdb.org/t/p/w300/backdrop.jpg');
      comp.ngOnDestroy();
      expect(ambient.image()).toBeNull();
    });

    it('works without the ambient service', () => {
      const comp = new TopBannerComponent({ bypassSecurityTrustStyle: (v: string) => v } as any);
      expect(() => { comp.ambient = '/x.jpg'; comp.ngOnDestroy(); }).not.toThrow();
    });
  });
});
