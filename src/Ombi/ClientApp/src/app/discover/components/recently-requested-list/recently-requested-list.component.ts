import { Component, OnInit, Input, OnDestroy, computed, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";

import { IRecentlyRequested, IRequestEngineResult, RequestType } from "../../../interfaces";
import { RequestServiceV2 } from "app/services/requestV2.service";
import { finalize, map, Subject, takeUntil, tap } from "rxjs";
import { Router } from "@angular/router";
import { AuthService } from "app/auth/auth.service";
import { NotificationService, RequestService } from "app/services";
import { TranslateService } from "@ngx-translate/core";
import { DenyDialogComponent } from '../../../media-details/components/shared/deny-dialog/deny-dialog.component';
import { MatDialog } from "@angular/material/dialog";
import { DetailedCardComponent } from "../../../components";
import { MediaRailComponent } from "../media-rail/media-rail.component";

export enum DiscoverType {
    Upcoming,
    Trending,
    Popular,
    RecentlyRequested,
    Seasonal,
}

@Component({
    standalone: true,
    selector: "ombi-recently-list",
    templateUrl: "./recently-requested-list.component.html",
    styleUrls: ["./recently-requested-list.component.scss"],
    host: {
        "[class.is-empty]": "isEmpty()",
    },
    imports: [
        CommonModule,
        RouterModule,
        TranslateModule,
        DetailedCardComponent,
        MediaRailComponent
    ]
})
export class RecentlyRequestedListComponent implements OnInit, OnDestroy {

    @Input() public id: string;
    @Input() public isAdmin: boolean;
    public readonly title = input<string>("");
    /** Editorial section number, e.g. "01". */
    public readonly index = input<string>("");
    /** Emits once loaded: true when there is at least one request to show. */
    public readonly hasItems = output<boolean>();

    public requests = signal<IRecentlyRequested[]>([]);
    public loaded = signal<boolean>(false);
    public isEmpty = computed(() => this.loaded() && this.requests().length === 0);

    public RequestType = RequestType;
    public loadingFlag: boolean;
    public DiscoverType = DiscoverType;

    private $loadSub = new Subject<void>();

    constructor(private requestServiceV2: RequestServiceV2,
        private requestService: RequestService,
        private router: Router,
        private authService: AuthService,
        private notificationService: NotificationService,
        private translateService: TranslateService,
        public dialog: MatDialog) {
    }

    public ngOnInit() {
        this.loadData();
        this.isAdmin = this.authService.isAdmin();
    }

    public navigate(request: IRecentlyRequested) {
        this.router.navigate([this.generateDetailsLink(request), request.mediaId]);
    }

    public approve(request: IRecentlyRequested) {
        switch(request.type) {
            case RequestType.movie:
                this.requestService.approveMovie({id: request.requestId, is4K: false}).pipe(
                    map((res) => this.handleApproval(res, request))
                ).subscribe();
                break;
            case RequestType.tvShow:
                this.requestService.approveChild({id: request.requestId}).pipe(
                    tap((res) => this.handleApproval(res, request))
                ).subscribe();
                break;
            case RequestType.album:
                this.requestService.approveAlbum({id: request.requestId}).pipe(
                    tap((res) => this.handleApproval(res, request))
                ).subscribe();
                break;
        }
    }

    public deny(request: IRecentlyRequested) {
        const dialogRef = this.dialog.open(DenyDialogComponent, {
            width: '250px',
            data: { requestId: request.requestId, is4K: false, requestType: request.type }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
              this.notificationService.success(this.translateService.instant("Requests.SuccessfullyDenied"));
              request.denied = true;
          }
        });
    }

    private handleApproval(result: IRequestEngineResult, request: IRecentlyRequested) {
        if (result.result) {
            this.notificationService.success(this.translateService.instant("Requests.SuccessfullyApproved"));
            request.approved = true;
        } else {
            this.notificationService.error(result.errorMessage);
        }
    }

    private generateDetailsLink(request: IRecentlyRequested): string {
        switch (request.type) {
            case RequestType.movie:
                return `/details/movie/`;
            case RequestType.tvShow:
                return `/details/tv/`;
            case RequestType.album: //Actually artist
                return `/details/artist/`;
        }
    }

    private loadData() {
        this.requestServiceV2.getRecentlyRequested().pipe(
            tap(() => this.loading()),
            takeUntil(this.$loadSub),
            finalize(() => {
                this.finishLoading();
                this.loaded.set(true);
            })
        ).subscribe({
            next: x => {
                this.requests.set(x || []);
                this.loaded.set(true);
                this.hasItems.emit(this.requests().length > 0);
            },
            error: () => this.hasItems.emit(false),
        });
    }

    private loading() {
        this.loadingFlag = true;
    }

    private finishLoading() {
        this.loadingFlag = false;
    }

    ngOnDestroy(): void {
        this.$loadSub.next();
        this.$loadSub.complete();
    }
}
