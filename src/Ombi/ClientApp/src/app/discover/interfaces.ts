import { RequestType } from "../interfaces";

export interface IDiscoverCardResult {
    id: number | string;
    posterPath: string;
    url: string | undefined;
    title: string;
    type: RequestType;
    available: boolean;
    approved: boolean;
    denied: boolean;
    requested: boolean;
    rating: number;
    overview: string;
    imdbid: string;
    background: string|any;

    tvMovieDb?: boolean;
    /** Deep links into the media server when the title is in the library. */
    plexUrl?: string;
    embyUrl?: string;
    jellyfinUrl?: string;
}

export enum DiscoverOption {
    Combined = 1,
    Movie = 2,
    Tv = 3
}

export enum DisplayOption {
    Card = 1,
    List = 2
}
