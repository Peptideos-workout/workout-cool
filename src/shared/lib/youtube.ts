// src/shared/lib/get-youtube-embed-url.ts

interface YouTubeEmbedOptions {
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  start?: number;
}

function secondsQueryParam(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function isYouTubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
}

/** Player options stored on an exercise video URL. Callers pass these into `getYouTubeEmbedUrl`. */
export function youTubeEmbedOptionsFromUrl(url: string): YouTubeEmbedOptions {
  if (!url) return {};
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return {};
  }

  const options: YouTubeEmbedOptions = {};
  if (params.get("autoplay") === "1") options.autoplay = true;
  const controls = params.get("controls");
  if (controls === "0") options.controls = false;
  else if (controls === "1") options.controls = true;
  if (params.get("loop") === "1") options.loop = true;
  const start = secondsQueryParam(params.get("start") ?? params.get("t"));
  if (start !== undefined) options.start = start;
  return options;
}

/**
 * Converts various YouTube URL formats into a standard embeddable URL.
 * Handles regular videos, shorts, youtu.be links, and playlists.
 * Returns null if the URL is invalid or the ID cannot be extracted.
 *
 * @param url The original YouTube URL string.
 * @param options Optional configuration for the embed (e.g., autoplay).
 * @returns The embeddable YouTube URL string or null.
 */
export function getYouTubeEmbedUrl(url: string, options: YouTubeEmbedOptions = {}): string | null {
  if (!url) {
    return null;
  }

  let videoId: string | null = null;
  let playlistId: string | null = null;

  try {
    const urlObject = new URL(url);
    const hostname = urlObject.hostname;
    const pathname = urlObject.pathname;
    const searchParams = urlObject.searchParams;

    // 1. Check for standard video URLs (youtube.com/watch?v=...)
    if (isYouTubeHost(hostname) && pathname === "/watch") {
      videoId = searchParams.get("v");
      // Check if it's also part of a playlist
      if (searchParams.get("list")) {
        playlistId = searchParams.get("list");
      }
    }
    // 2. Check for short URLs (youtu.be/...)
    else if (hostname === "youtu.be") {
      videoId = pathname.substring(1); // Remove leading '/'
    }
    // 3. Check for embed URLs (/embed/...)
    else if (isYouTubeHost(hostname) && pathname.startsWith("/embed/")) {
      videoId = pathname.substring("/embed/".length);
    }
    // 4. Check for shorts URLs (/shorts/...)
    else if (isYouTubeHost(hostname) && pathname.startsWith("/shorts/")) {
      videoId = pathname.substring("/shorts/".length);
    }
    // 5. Check for playlist URLs (youtube.com/playlist?list=...)
    else if (isYouTubeHost(hostname) && pathname === "/playlist") {
      playlistId = searchParams.get("list");
    }
    // Note: Channel URLs (/channel/..., /c/..., /@handle) are not directly embeddable in the same way.
    // You usually embed a specific video or playlist from a channel.
  } catch (error) {
    // If URL parsing fails, maybe it's just an ID/handle? We don't handle that here for embeds.
    console.warn("Could not parse as URL for embed:", url, error);
    // For embeds, we need a video or playlist ID extracted from a valid URL structure.
    return null;
  }

  // --- Construct Embed URL ---

  const baseEmbedUrl = "https://www.youtube-nocookie.com/embed/";
  const queryParams = new URLSearchParams();

  if (options.autoplay) {
    queryParams.set("autoplay", "1");
    queryParams.set("mute", "1");
  }

  // Maximum `YouTube` branding removal
  queryParams.set("modestbranding", "1");
  queryParams.set("rel", "0");
  queryParams.set("showinfo", "0");
  queryParams.set("controls", options.controls === false ? "0" : "1");
  queryParams.set("iv_load_policy", "3"); // Hide annotations
  queryParams.set("cc_load_policy", "0"); // Hide captions by default
  queryParams.set("fs", "1");
  queryParams.set("disablekb", "1"); // Disable keyboard controls
  queryParams.set("playsinline", "1"); // Mobile optimization
  queryParams.set("origin", typeof window !== "undefined" ? window.location.origin : "");
  if (options.loop) queryParams.set("loop", "1");
  if (typeof options.start === "number" && Number.isFinite(options.start) && options.start >= 0) {
    queryParams.set("start", String(Math.floor(options.start)));
  }

  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    videoId = null;
  }

  // Prioritize playlist embed if playlistId is found
  if (playlistId) {
    // For playlist embed, use videoseries?list=...
    queryParams.set("list", playlistId);
    // If a videoId was also found, it becomes the first video in the playlist context
    const path = videoId ? videoId : "videoseries";
    return `${baseEmbedUrl}${path}?${queryParams.toString()}`;
  }
  // Otherwise, embed the single video if videoId is found
  else if (videoId) {
    if (options.loop) queryParams.set("playlist", videoId);
    return `${baseEmbedUrl}${videoId}?${queryParams.toString()}`;
  }

  // If neither videoId nor playlistId could be extracted
  return null;
}
