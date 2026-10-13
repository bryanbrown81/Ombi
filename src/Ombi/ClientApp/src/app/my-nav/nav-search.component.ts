import { Component, OnInit, ViewChild, ElementRef, DestroyRef, inject, signal, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { Subject, fromEvent } from "rxjs";
import { debounceTime, filter, map, startWith } from "rxjs/operators";

import { InstantSearchController } from "../shared/instant-search/instant-search.controller";
import { SearchPanelComponent } from "../shared/instant-search/search-panel.component";
import { SearchShortcutService } from "../shared/instant-search/search-shortcut.service";

/** Debounce for live-updating the results page as the user types (matches the previous behaviour). */
const RESULTS_PAGE_DEBOUNCE_MS = 600;

@Component({
    standalone: true,
    selector: "app-nav-search",
    templateUrl: "./nav-search.component.html",
    styleUrls: ["./nav-search.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [InstantSearchController],
    imports: [
        CommonModule,
        TranslateModule,
        SearchPanelComponent
    ]
})
export class NavSearchComponent implements OnInit {

  @ViewChild('searchInput') searchInput: ElementRef<HTMLInputElement>;

  public readonly ctrl = inject(InstantSearchController);
  public readonly expanded = signal(false);
  public readonly isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly shortcuts = inject(SearchShortcutService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly onResultsPage = signal(false);
  private readonly liveTerm$ = new Subject<string>();

  public ngOnInit() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.syncWithRoute());

    // On the results page, typing updates the results in place (as it always has).
    this.liveTerm$.pipe(
      debounceTime(RESULTS_PAGE_DEBOUNCE_MS),
      map(value => (value ?? '').trim()),
      filter(term => !!term && this.onResultsPage() && term !== this.routeTerm()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(term => this.router.navigate(['discover', term], { replaceUrl: true }));

    fromEvent<KeyboardEvent>(this.document, 'keydown').pipe(
      filter(event => SearchShortcutService.isShortcut(event)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(event => {
      event.preventDefault();
      if (!this.shortcuts.focusPreferred()) {
        this.expandAndFocus();
      }
    });
  }

  public onInput(value: string): void {
    this.ctrl.setQuery(value);
    if (this.onResultsPage()) {
      this.liveTerm$.next(value);
    }
  }

  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.onResultsPage() && !this.ctrl.activeOption()) {
      event.preventDefault();
      const term = this.ctrl.term();
      if (term) {
        this.ctrl.remember(term);
        this.router.navigate(['discover', term]);
      }
      return;
    }
    const handled = this.ctrl.handleKeydown(event);
    if (!handled && event.key === 'Escape') {
      if (!this.ctrl.query()) {
        this.expanded.set(false);
      }
      this.searchInput?.nativeElement?.blur();
    }
  }

  public onFocus(): void {
    this.expanded.set(true);
    this.ctrl.openPanel();
  }

  public onBlur(): void {
    this.ctrl.close();
    if (!this.ctrl.query()) {
      this.expanded.set(false);
    }
  }

  public toggleSearch(): void {
    if (this.expanded() && !this.ctrl.query()) {
      this.expanded.set(false);
      this.searchInput?.nativeElement?.blur();
    } else {
      this.expandAndFocus();
    }
  }

  public clearSearch(): void {
    this.ctrl.setQuery('');
    this.searchInput?.nativeElement?.focus();
  }

  private expandAndFocus(): void {
    this.expanded.set(true);
    requestAnimationFrame(() => {
      const input = this.searchInput?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  private syncWithRoute(): void {
    const term = this.routeTerm();
    const onResults = term !== null;
    this.onResultsPage.set(onResults);
    this.ctrl.suggestionsOnly.set(onResults);
    // Reflect the searched term in the box (e.g. after a reload or picking a recent search).
    const focused = this.document.activeElement === this.searchInput?.nativeElement;
    if (onResults && term.trim() && !focused && term !== this.ctrl.query()) {
      this.ctrl.query.set(term);
      this.expanded.set(true);
    }
  }

  /** The search term when the current route is the search results page, otherwise null. */
  private routeTerm(): string | null {
    const segments = this.router.parseUrl(this.router.url).root.children['primary']?.segments ?? [];
    if (segments.length === 2 && segments[0].path === 'discover') {
      return segments[1].path;
    }
    return null;
  }
}
