import { describe, it, expect, vi } from 'vitest';
import { SearchShortcutService } from './search-shortcut.service';

function keydown(key: string, init: KeyboardEventInit = {}, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...init });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  return event;
}

describe('SearchShortcutService', () => {
  describe('isShortcut', () => {
    it('accepts Ctrl+K and Cmd+K anywhere', () => {
      expect(SearchShortcutService.isShortcut(keydown('k', { ctrlKey: true }))).toBe(true);
      expect(SearchShortcutService.isShortcut(keydown('K', { metaKey: true }))).toBe(true);
      expect(SearchShortcutService.isShortcut(keydown('k', { ctrlKey: true }, document.createElement('input')))).toBe(true);
    });

    it('accepts "/" outside editable fields only', () => {
      expect(SearchShortcutService.isShortcut(keydown('/', {}, document.createElement('div')))).toBe(true);
      expect(SearchShortcutService.isShortcut(keydown('/', {}, document.createElement('input')))).toBe(false);
      expect(SearchShortcutService.isShortcut(keydown('/', {}, document.createElement('textarea')))).toBe(false);
    });

    it('rejects other keys and modified slashes', () => {
      expect(SearchShortcutService.isShortcut(keydown('k'))).toBe(false);
      expect(SearchShortcutService.isShortcut(keydown('/', { ctrlKey: true }))).toBe(false);
      expect(SearchShortcutService.isShortcut(keydown('k', { ctrlKey: true, altKey: true }))).toBe(false);
    });
  });

  describe('focusPreferred', () => {
    it('returns false when nothing is registered', () => {
      expect(new SearchShortcutService().focusPreferred()).toBe(false);
    });

    it('asks the most recently registered target first', () => {
      const service = new SearchShortcutService();
      const older = vi.fn().mockReturnValue(true);
      const newer = vi.fn().mockReturnValue(true);
      service.register(older);
      service.register(newer);
      expect(service.focusPreferred()).toBe(true);
      expect(newer).toHaveBeenCalled();
      expect(older).not.toHaveBeenCalled();
    });

    it('falls through targets that decline, and unregisters cleanly', () => {
      const service = new SearchShortcutService();
      const fallback = vi.fn().mockReturnValue(true);
      const offscreen = vi.fn().mockReturnValue(false);
      service.register(fallback);
      const unregister = service.register(offscreen);
      expect(service.focusPreferred()).toBe(true);
      expect(fallback).toHaveBeenCalledTimes(1);

      unregister();
      service.focusPreferred();
      expect(offscreen).toHaveBeenCalledTimes(1);
    });
  });
});
