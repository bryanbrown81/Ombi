import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoverCardComponent } from './discover-card.component';
import { IDiscoverCardResult } from '../../interfaces';
import { RequestType } from '../../../interfaces';
import { of, throwError } from 'rxjs';

function createComponent() {
  const mockSearchService = {
    getTvInfoWithMovieDbId: vi.fn(),
    getFullMovieDetails: vi.fn().mockReturnValue(of({})),
    getArtistInformation: vi.fn().mockReturnValue(of({})),
    getReleaseGroupArt: vi.fn().mockReturnValue(of({})),
  };
  const mockDialog = {
    open: vi.fn().mockReturnValue({ afterClosed: () => of(null) }),
  };
  const mockRequestService = {
    requestMovie: vi.fn().mockReturnValue(of({ result: true })),
  };
  const mockMessageService = {
    send: vi.fn(),
    sendRequestEngineResultError: vi.fn(),
  };
  const mockTranslate = {
    instant: vi.fn((key: string) => key),
    currentLang: 'en',
  };

  const comp = new DiscoverCardComponent(
    mockSearchService as any,
    mockDialog as any,
    mockRequestService as any,
    mockMessageService as any,
    mockTranslate as any,
  );

  return { comp, mockSearchService, mockDialog, mockRequestService, mockMessageService, mockTranslate };
}

function makeResult(overrides: Partial<IDiscoverCardResult> = {}): IDiscoverCardResult {
  return {
    id: 123,
    posterPath: '/poster.jpg',
    url: undefined,
    title: 'Test Movie',
    type: RequestType.movie,
    available: false,
    approved: false,
    denied: false,
    requested: false,
    rating: 7.5,
    overview: 'A test movie',
    imdbid: 'tt1234567',
    background: '/bg.jpg',
    ...overrides,
  };
}

describe('DiscoverCardComponent', () => {
  describe('generateDetailsLink', () => {
    it('should return movie details link', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ type: RequestType.movie, id: 42 });
      expect(comp.generateDetailsLink()).toBe('/details/movie/42');
    });

    it('should return tv details link', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ type: RequestType.tvShow, id: 99 });
      expect(comp.generateDetailsLink()).toBe('/details/tv/99');
    });

    it('should return artist details link for album type', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ type: RequestType.album, id: 'abc-123' });
      expect(comp.generateDetailsLink()).toBe('/details/artist/abc-123');
    });
  });

  describe('getStatusClass', () => {
    it('should return "available" when result is available', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ available: true });
      expect(comp.getStatusClass()).toBe('available');
    });

    it('should return "approved" when result is approved but not available', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ approved: true });
      expect(comp.getStatusClass()).toBe('approved');
    });

    it('should return "denied" when result is denied', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ denied: true });
      expect(comp.getStatusClass()).toBe('denied');
    });

    it('should return "requested" when result is requested', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ requested: true });
      expect(comp.getStatusClass()).toBe('requested');
    });

    it('should return empty string when no status applies', () => {
      const { comp } = createComponent();
      comp.result = makeResult();
      expect(comp.getStatusClass()).toBe('');
    });

    it('should prioritize available over approved', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ available: true, approved: true });
      expect(comp.getStatusClass()).toBe('available');
    });
  });

  describe('getAvailabilityStatus', () => {
    it('should return Available translation when available', () => {
      const { comp, mockTranslate } = createComponent();
      comp.result = makeResult({ available: true });
      mockTranslate.instant.mockReturnValue('Available');
      expect(comp.getAvailabilityStatus()).toBe('Available');
    });

    it('should return Approved translation when approved', () => {
      const { comp, mockTranslate } = createComponent();
      comp.result = makeResult({ approved: true });
      mockTranslate.instant.mockImplementation((key: string) => {
        if (key === 'Common.Approved') return 'Approved';
        return key;
      });
      expect(comp.getAvailabilityStatus()).toBe('Approved');
    });

    it('should return empty string when no status', () => {
      const { comp } = createComponent();
      comp.result = makeResult();
      expect(comp.getAvailabilityStatus()).toBe('');
    });
  });

  describe('ngOnInit', () => {
    it('should call getExtraMovieInfo for movie type', () => {
      const { comp, mockSearchService } = createComponent();
      comp.result = makeResult({ type: RequestType.movie, imdbid: '' });
      mockSearchService.getFullMovieDetails.mockReturnValue(of({
        imdbId: 'tt999', available: true, requested: false, approved: false,
        denied: false, voteAverage: 8.0, overview: 'Updated', available4K: false,
        has4KRequest: false, denied4K: false,
      }));

      comp.ngOnInit();

      expect(comp.allow4KButton).toBe(true);
      expect(comp.requestable).toBe(true);
    });

    it('should set fullyLoaded for movie with existing imdbid', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ type: RequestType.movie, imdbid: 'tt1234567' });

      comp.ngOnInit();

      expect(comp.fullyLoaded).toBe(true);
      expect(comp.requestable).toBe(true);
    });

    it('should call getExtraTvInfo for tv type', async () => {
      const { comp, mockSearchService } = createComponent();
      comp.result = makeResult({ type: RequestType.tvShow });
      mockSearchService.getTvInfoWithMovieDbId.mockResolvedValue({
        title: 'Updated Show', id: 123, requested: true,
        imdbId: 'tt999', overview: 'TV Overview', approved: false,
        fullyAvailable: false, partlyAvailable: false, denied: false,
      });

      comp.ngOnInit();
      // Wait for the async getTvInfoWithMovieDbId promise to resolve
      await vi.waitFor(() => {
        expect(comp.fullyLoaded).toBe(true);
      });
    });
  });

  describe('requestMovie (via request)', () => {
    it('should call requestService and update result on success', () => {
      const { comp, mockRequestService, mockMessageService, mockTranslate } = createComponent();
      comp.result = makeResult({ type: RequestType.movie });
      comp.isAdmin = false;
      mockRequestService.requestMovie.mockReturnValue(of({ result: true }));
      mockTranslate.instant.mockReturnValue('Request added');

      const event = { preventDefault: vi.fn() };
      comp.request(event, false);

      expect(mockRequestService.requestMovie).toHaveBeenCalled();
      expect(comp.result.requested).toBe(true);
      expect(mockMessageService.send).toHaveBeenCalledWith('Request added', 'Ok');
    });

    it('should handle request failure', () => {
      const { comp, mockRequestService, mockMessageService } = createComponent();
      comp.result = makeResult({ type: RequestType.movie });
      comp.isAdmin = false;
      mockRequestService.requestMovie.mockReturnValue(of({ result: false, errorCode: 0 }));

      const event = { preventDefault: vi.fn() };
      comp.request(event, false);

      expect(mockMessageService.sendRequestEngineResultError).toHaveBeenCalled();
    });

    it('should handle request error', () => {
      const { comp, mockRequestService, mockMessageService } = createComponent();
      comp.result = makeResult({ type: RequestType.movie });
      comp.isAdmin = false;
      mockRequestService.requestMovie.mockReturnValue(throwError(() => new Error('Network error')));

      const event = { preventDefault: vi.fn() };
      comp.request(event, false);

      expect(mockMessageService.sendRequestEngineResultError).toHaveBeenCalled();
      expect(comp.loading).toBe(false);
    });

    it('should open admin dialog for admin users', () => {
      const { comp, mockDialog } = createComponent();
      comp.result = makeResult({ type: RequestType.movie });
      comp.isAdmin = true;

      const event = { preventDefault: vi.fn() };
      comp.request(event, false);

      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open episode request dialog for TV shows', () => {
      const { comp, mockDialog } = createComponent();
      comp.result = makeResult({ type: RequestType.tvShow });

      const event = { preventDefault: vi.fn() };
      comp.request(event, false);

      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('media server availability', () => {
    it('prefers Plex, then Emby, then Jellyfin', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ available: true, plexUrl: 'https://plex/x', embyUrl: 'https://emby/x', jellyfinUrl: 'https://jf/x' });
      expect(comp.getMediaServer()).toMatchObject({ key: 'plex', name: 'Plex', url: 'https://plex/x', playKey: 'Search.ViewOnPlex' });

      comp.result = makeResult({ available: true, embyUrl: 'https://emby/x', jellyfinUrl: 'https://jf/x' });
      expect(comp.getMediaServer()?.key).toBe('emby');

      comp.result = makeResult({ available: true, jellyfinUrl: 'https://jf/x' });
      expect(comp.getMediaServer()?.key).toBe('jellyfin');

      comp.result = makeResult({ available: true });
      expect(comp.getMediaServer()).toBeNull();
    });

    it('only offers playback when the title is available', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ available: false, plexUrl: 'https://plex/x' });
      expect(comp.getPlayTarget()).toBeNull();

      comp.result = makeResult({ available: true, plexUrl: 'https://plex/x' });
      expect(comp.getPlayTarget()?.url).toBe('https://plex/x');
    });

    it('labels the badge with the server name', () => {
      const { comp, mockTranslate } = createComponent();
      comp.result = makeResult({ available: true, plexUrl: 'https://plex/x' });
      expect(comp.getAvailabilityStatus()).toBe('Discovery.Card.OnServer');
      expect(mockTranslate.instant).toHaveBeenCalledWith('Discovery.Card.OnServer', { server: 'Plex' });
    });

    it('labels partly available shows as partly on the server', () => {
      const { comp, mockTranslate } = createComponent();
      comp.result = makeResult({ type: RequestType.tvShow, available: true, plexUrl: 'https://plex/x' });
      (comp as any).tvSearchResult = { partlyAvailable: true, fullyAvailable: false };
      comp.getAvailabilityStatus();
      expect(mockTranslate.instant).toHaveBeenCalledWith('Discovery.Card.PartlyOnServer', { server: 'Plex' });
    });

    it('keeps the plain "Available" label without a server link', () => {
      const { comp } = createComponent();
      comp.result = makeResult({ available: true });
      expect(comp.getAvailabilityStatus()).toBe('Common.Available');
    });

    it('picks up server links from the full movie details', () => {
      const { comp, mockSearchService } = createComponent();
      mockSearchService.getFullMovieDetails.mockReturnValue(of({ imdbId: 'tt1', available: true, plexUrl: 'https://plex/movie' }));
      comp.result = makeResult({ type: RequestType.movie, imdbid: '' });
      comp.ngOnInit();
      expect(comp.result.plexUrl).toBe('https://plex/movie');
      expect(comp.getPlayTarget()?.key).toBe('plex');
    });

    it('picks up server links from the TV details', async () => {
      const { comp, mockSearchService } = createComponent();
      mockSearchService.getTvInfoWithMovieDbId.mockResolvedValue({ id: 5, title: 'Show', fullyAvailable: true, partlyAvailable: false, jellyfinUrl: 'https://jf/show' });
      comp.result = makeResult({ type: RequestType.tvShow });
      await comp.getExtraTvInfo();
      expect(comp.result.jellyfinUrl).toBe('https://jf/show');
      expect(comp.getPlayTarget()?.key).toBe('jellyfin');
    });
  });

  describe('change detection inside OnPush lists', () => {
    it('marks itself for check once async movie details arrive', () => {
      const { comp, mockSearchService } = createComponent();
      const cdr = { markForCheck: vi.fn() };
      (comp as any).changeDetector = cdr;
      mockSearchService.getFullMovieDetails.mockReturnValue(of({ imdbId: 'tt9', available: false }));
      comp.result = makeResult({ type: RequestType.movie, imdbid: '' });

      comp.ngOnInit();

      expect(comp.fullyLoaded).toBe(true);
      expect(cdr.markForCheck).toHaveBeenCalled();
    });

    it('marks itself for check when a request completes', () => {
      const { comp } = createComponent();
      const cdr = { markForCheck: vi.fn() };
      (comp as any).changeDetector = cdr;
      comp.result = makeResult({ type: RequestType.movie });
      comp.request({ preventDefault: vi.fn() }, false);
      expect(comp.loading).toBe(false);
      expect(cdr.markForCheck).toHaveBeenCalled();
    });
  });
});
