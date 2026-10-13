export type MediaServerKey = "plex" | "emby" | "jellyfin";

export interface IMediaServerLink {
    key: MediaServerKey;
    name: string;
    url: string;
    /** Translation key for the "Play on …" action. */
    playKey: string;
}

export interface IMediaServerUrls {
    plexUrl?: string | null;
    embyUrl?: string | null;
    jellyfinUrl?: string | null;
}

/**
 * The media server that holds a title, preferring Plex, then Emby, then Jellyfin.
 *
 * The API only sets these URLs when the title was found in that server's library, so a URL
 * means "it's on the server" even when `available` is false (e.g. when Radarr/Sonarr are set
 * to take priority for availability, or only a 4K copy exists).
 */
export function getMediaServerLink(item: IMediaServerUrls | null | undefined): IMediaServerLink | null {
    if (item?.plexUrl) {
        return { key: "plex", name: "Plex", url: item.plexUrl, playKey: "Search.ViewOnPlex" };
    }
    if (item?.embyUrl) {
        return { key: "emby", name: "Emby", url: item.embyUrl, playKey: "Search.ViewOnEmby" };
    }
    if (item?.jellyfinUrl) {
        return { key: "jellyfin", name: "Jellyfin", url: item.jellyfinUrl, playKey: "Search.ViewOnJellyfin" };
    }
    return null;
}
