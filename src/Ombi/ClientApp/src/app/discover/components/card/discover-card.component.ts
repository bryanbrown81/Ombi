import { ChangeDetectorRef, Component, Input, OnInit, Optional } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { TranslateModule } from "@ngx-translate/core";

import { MessageService, RequestService, SearchV2Service } from "../../../services";
import { AdminRequestDialogComponent } from "../../../shared/admin-request-dialog/admin-request-dialog.component";
import { DiscoverType } from "../carousel-list/carousel-list.component";
import { EpisodeRequestComponent } from "../../../shared/episode-request/episode-request.component";
import { IDiscoverCardResult } from "../../interfaces";
import { ISearchMovieResultV2 } from "../../../interfaces/ISearchMovieResultV2";
import { ISearchTvResultV2 } from "../../../interfaces/ISearchTvResultV2";
import { MatDialog } from "@angular/material/dialog";
import { IMovieRequestModel, RequestType } from "../../../interfaces";
import { TranslateService } from "@ngx-translate/core";
import { ImageComponent } from "../../../components";
import { TiltDirective } from "../../directives/tilt.directive";
import { IMediaServerLink, getMediaServerLink } from "../../media-server";

export { IMediaServerLink, MediaServerKey } from "../../media-server";

@Component({
    standalone: true,
    selector: "discover-card",
    templateUrl: "./discover-card.component.html",
    styleUrls: ["./discover-card.component.scss", "./discover-card.actions.scss", "./discover-card.glass.scss"],
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatMenuModule,
        MatProgressSpinnerModule,
        TranslateModule,
        ImageComponent,
        TiltDirective
    ]
})
export class DiscoverCardComponent implements OnInit {

    @Input() public discoverType: DiscoverType;
    @Input() public result: IDiscoverCardResult;
    @Input() public isAdmin: boolean;
    @Input() public is4kEnabled: boolean = false;
    public RequestType = RequestType;
    public hide: boolean;
    public fullyLoaded = false;
    public posterLoaded = false;
    public loading: boolean;
    public allow4KButton: boolean = false;

    public requestable: boolean;

    // This data is needed to open the dialog
    private tvSearchResult: ISearchTvResultV2;

    constructor(private searchService: SearchV2Service, private dialog: MatDialog, private requestService: RequestService,
        public messageService: MessageService, private translate: TranslateService,
        @Optional() private changeDetector?: ChangeDetectorRef) { }

    public ngOnInit() {
        if (this.result.type == RequestType.tvShow) {
            this.fullyLoaded = true;
            this.getExtraTvInfo();
        }
        if (this.result.type == RequestType.movie) {
            this.allow4KButton = true;
            this.getExtraMovieInfo();
        }
        if (this.result.type == RequestType.album) {
            this.getAlbumInformation();
        }
    }

    public async getExtraTvInfo() {
        this.tvSearchResult = await this.searchService.getTvInfoWithMovieDbId(+this.result.id);
        this.requestable = true;
        this.setTvDefaults(this.tvSearchResult);
        this.updateTvItem(this.tvSearchResult);
    }

    public async getAlbumInformation() {
        this.searchService.getArtistInformation(this.result.id.toString()).subscribe(x => {
            if (x.poster) {
                this.result.posterPath = x.poster;
                this.fullyLoaded = true;
            } else {
                this.searchService.getReleaseGroupArt(this.result.id.toString()).subscribe(art => {
                    if (art.image) {
                        this.result.posterPath = art.image;
                        this.refresh();
                    }
                })
            }
            this.result.title = x.startYear ? `${x.name} (${x.startYear})` : x.name;
            this.result.overview = x.overview;
            this.fullyLoaded = true;
            this.requestable = true;
            this.refresh();
        });
    }

    public generateDetailsLink(): string {
        switch (this.result.type) {
            case RequestType.movie:
                return `/details/movie/${this.result.id}`;
            case RequestType.tvShow:
                return `/details/tv/${this.result.id}`;
            case RequestType.album: //Actually artist
                return `/details/artist/${this.result.id}`;
        }
    }

    public getStatusClass(): string {
        if (this.result.available || this.getMediaServer()) {
            return "available";
        }
        if (this.tvSearchResult?.partlyAvailable) {
            return "partly-available";
        }
        if (this.result.approved) {
            return "approved";
        }
        if (this.result.denied) {
            return "denied";
        }
        if (this.result.requested) {
            return "requested";
        }
        return "";
    }

    /** The media server holding this title, preferring Plex, then Emby, then Jellyfin. */
    public getMediaServer(): IMediaServerLink | null {
        return getMediaServerLink(this.result);
    }

    /**
     * The server to play from. A server link alone is enough: the API only sets it when the
     * title is in that library, even if `available` is false (Radarr/Sonarr priority, 4K-only).
     */
    public getPlayTarget(): IMediaServerLink | null {
        return this.getMediaServer();
    }

    public isPartlyAvailable(): boolean {
        return !!this.tvSearchResult?.partlyAvailable && !this.tvSearchResult?.fullyAvailable;
    }

    public getAvailabilityStatus(): string {
        const server = this.getMediaServer();
        if (this.result.available || server) {
            if (server) {
                return this.translate.instant(this.isPartlyAvailable() ? "Discovery.Card.PartlyOnServer" : "Discovery.Card.OnServer", { server: server.name });
            }
            return this.translate.instant("Common.Available");
        }
        if (this.tvSearchResult?.partlyAvailable) {
            return this.translate.instant("Common.PartlyAvailable");
        }
        if (this.result.approved) {
            return this.translate.instant("Common.Approved");
        }
        if (this.result.denied) {
            return this.translate.instant("Common.Denied");
        }
        if (this.result.requested) {
            return this.translate.instant("Common.Pending");
        }
        return "";
    }

    public request(event: any, is4k: boolean) {
        event.preventDefault();
        this.loading = true;
        switch (this.result.type) {
          case RequestType.tvShow:
            const dialog = this.dialog.open(EpisodeRequestComponent, {
              width: "700px",
              data: { series: this.tvSearchResult, isAdmin: this.isAdmin },
              panelClass: "modal-panel",
            });
            dialog.afterClosed().subscribe(() => this.finishLoading());
            break;
          case RequestType.movie:
            const movieRequest: IMovieRequestModel = {
              theMovieDbId: +this.result.id,
              languageCode: this.translate.currentLang,
              requestOnBehalf: null,
              qualityPathOverride: null,
              rootFolderOverride: null,
              is4KRequest: is4k,
            };

            if (!this.isAdmin) {
              this.requestMovie(movieRequest);
              break;
            }

            const adminRequestDialog = this.dialog.open(
              AdminRequestDialogComponent,
              {
                width: "700px",
                data: { type: RequestType.movie, id: this.result.id, is4k: is4k },
                panelClass: "modal-panel",
              }
            );
            adminRequestDialog.afterClosed().subscribe((result) => {
              if (!result) {
                this.finishLoading();
                return;
              }

              movieRequest.requestOnBehalf = result.username?.id;
              movieRequest.qualityPathOverride = result.radarrPathId;
              movieRequest.rootFolderOverride = result.radarrFolderId;
              this.requestMovie(movieRequest);
            });
            break;
        }
    }

    private requestMovie(movieRequest: IMovieRequestModel) {
        this.requestService.requestMovie(movieRequest).subscribe({
          next: (response) => {
            if (response.result) {
              this.result.requested = true;
              const message = this.translate.instant(
                "Requests.RequestAddedSuccessfully",
                { title: this.result.title }
              );
              this.messageService.send(message, "Ok");
            } else {
              this.messageService.sendRequestEngineResultError(response);
            }

            this.finishLoading();
          },
          error: (error) => {
            this.messageService.sendRequestEngineResultError(error);
            this.finishLoading();
          },
        });
    }

    public onImageError(event: any) {
        const originalSrc = event.target.src;

        // set to a placeholder
        event.target.src = "../../../images/default_movie_poster.png";

        // Retry the original image
        const timeout = setTimeout(() => {
            event.target.src = originalSrc;
            clearTimeout(timeout);
        }, Math.floor(Math.random() * (7000 - 1000 + 1)) + 1000);
    }

    private getExtraMovieInfo() {
        if (!this.result.imdbid) {
            this.searchService.getFullMovieDetails(+this.result.id)
                .subscribe(m => {
                    this.updateMovieItem(m);
                });
        } else {
            this.fullyLoaded = true;
        }
        this.requestable = true;
    }

    private updateMovieItem(updated: ISearchMovieResultV2) {
        this.result.url = "http://www.imdb.com/title/" + updated.imdbId + "/";
        this.result.available = updated.available || updated.available4K;
        this.result.requested = updated.requested || updated.has4KRequest;
        this.result.approved = updated.approved || updated.available4K;
        this.result.denied = updated.denied || updated.denied4K;
        this.result.rating = updated.voteAverage;
        this.result.overview = updated.overview;
        this.result.imdbid = updated.imdbId;
        this.result.plexUrl = updated.plexUrl;
        this.result.embyUrl = updated.embyUrl;
        this.result.jellyfinUrl = updated.jellyfinUrl;

        this.fullyLoaded = true;
        this.refresh();
    }

    private finishLoading() {
        this.loading = false;
        this.refresh();
    }

    /**
     * Cards sit inside OnPush lists (the discover rails and the search results), so state that
     * arrives asynchronously must mark the card for checking or it never renders.
     */
    private refresh() {
        this.changeDetector?.markForCheck();
    }

    private setTvDefaults(x: ISearchTvResultV2) {
        if (x.imdbId) {
            x.imdbId = "http://www.imdb.com/title/" + x.imdbId + "/";
        } else {
            x.imdbId = "https://www.tvmaze.com/shows/" + x.seriesId;
        }
    }

    private updateTvItem(updated: ISearchTvResultV2) {
        this.result.title = updated.title;
        this.result.id = updated.id;
        // this.result.available = updated.fullyAvailable || updated.partlyAvailable;
        // this.result.posterPath = updated.banner;
        this.result.requested = updated.requested;
        this.result.url = updated.imdbId;
        this.result.overview = updated.overview;
        this.result.approved = updated.approved;
        this.result.available = updated.fullyAvailable || updated.partlyAvailable;
        this.result.denied = updated.denied;
        this.result.plexUrl = updated.plexUrl;
        this.result.embyUrl = updated.embyUrl;
        this.result.jellyfinUrl = updated.jellyfinUrl;

        this.fullyLoaded = true;
        this.refresh();
    }

}
