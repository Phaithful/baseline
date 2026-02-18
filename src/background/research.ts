import type {
  AppleMusicScrape,
  EvidenceItem,
  PopularitySignals,
  TargetProfile,
} from "../shared/types";

function safeText(s?: string) {
  return (s ?? "").trim();
}
function norm(s?: string) {
  return safeText(s).toLowerCase();
}

export function titleMatch(a?: string, b?: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export async function openTab(url: string, active = false) {
  return await chrome.tabs.create({ url, active });
}

export async function waitForTabComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for tab to load"));
    }, timeoutMs);

    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function itunesLookupUrlById(id: string, country = "ca"): Promise<string | null> {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=${encodeURIComponent(country)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const item = data?.results?.[0];
  return item?.trackViewUrl || item?.collectionViewUrl || null;
}

export async function scrapeAppleMusicTab(tabId: number): Promise<AppleMusicScrape> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const url = location.href;
      const pageTitle = document.title || "";

      const h1 = document.querySelector("h1")?.textContent?.trim() ?? "";
      const artistLink =
        document.querySelector('a[href*="/artist/"]')?.textContent?.trim() ?? "";

      const tracks: { title: string; artist?: string }[] = [];
      const nodes = Array.from(document.querySelectorAll("li, div, span"));

      for (const el of nodes) {
        const t = (el.textContent ?? "").trim();
        if (!t) continue;
        if (t.length < 2 || t.length > 80) continue;
        if (/shuffle|play|add|more|copyright|apple music/i.test(t)) continue;
        tracks.push({ title: t });
        if (tracks.length >= 80) break;
      }

      const seen = new Set<string>();
      const deduped = tracks
        .map((x) => ({ title: x.title.trim() }))
        .filter((x) => {
          const k = x.title.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 60);

      return {
        url,
        pageTitle,
        title: h1 || pageTitle,
        artist: artistLink || undefined,
        tracks: deduped.length ? deduped : undefined,
      };
    },
  });

  return result as AppleMusicScrape;
}

export function buildExternalLinks(query: string) {
  return {
    googleAppleMusic: `https://www.google.com/search?q=${encodeURIComponent(query + " apple music")}`,
    genius: `https://genius.com/search?q=${encodeURIComponent(query)}`,
    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
  };
}

export function addEvidence(evidence: EvidenceItem[], item: EvidenceItem) {
  evidence.push(item);
}

export function containsTargetByTitle(
  appleMusic: AppleMusicScrape | undefined,
  target: TargetProfile | undefined
) {
  if (!appleMusic?.tracks?.length) return false;
  const t = target?.title;
  if (!t) return false;
  return appleMusic.tracks.some((tr) => titleMatch(tr.title, t));
}

export function initPopularity(): PopularitySignals {
  return { notes: [] };
}

// ---------------------------
// Popularity scraping helpers
// ---------------------------

function parseNumberLike(text: string): number | undefined {
  // Supports: 1,234,567 ; 1.2M ; 56K
  const t = text.replace(/,/g, "").trim();

  const m = t.match(/(\d+(\.\d+)?)([MK])?/i);
  if (!m) return undefined;

  const base = Number(m[1]);
  if (Number.isNaN(base)) return undefined;

  const suffix = (m[3] || "").toUpperCase();
  if (suffix === "M") return Math.round(base * 1_000_000);
  if (suffix === "K") return Math.round(base * 1_000);
  return Math.round(base);
}

export async function scrapeYouTubePopularity(query: string): Promise<NonNullable<PopularitySignals["youtube"]>> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const tab = await openTab(url, false);

  const out: PopularitySignals["youtube"] = { url, notes: [] };

  if (!tab.id) {
    out.notes?.push("Could not open YouTube tab.");
    return out;
  }

  await waitForTabComplete(tab.id);

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Consent walls or blocked UI detection
      const bodyText = (document.body?.innerText || "").toLowerCase();
      if (bodyText.includes("before you continue") || bodyText.includes("consent")) {
        return { blocked: true, reason: "Consent/region wall may require manual action." };
      }

      // Try to locate first video renderer
      const first = document.querySelector("ytd-video-renderer, ytd-grid-video-renderer");
      if (!first) return { blocked: true, reason: "No video items found (layout changed or still loading)." };

      // Title
      const title =
        (first.querySelector("#video-title") as HTMLElement | null)?.innerText?.trim() ||
        (first.querySelector("a#video-title") as HTMLElement | null)?.textContent?.trim() ||
        "";

      // Channel
      const channel =
        (first.querySelector("ytd-channel-name a") as HTMLElement | null)?.innerText?.trim() ||
        "";

      // Views - often appears in metadata line; grab any text containing "views"
      const metaText =
        (first.querySelector("#metadata-line") as HTMLElement | null)?.innerText ||
        (first as HTMLElement).innerText ||
        "";

      // Find something like "1,234,567 views" or "1.2M views"
      const viewsMatch = metaText.match(/([\d,.]+)\s*(M|K)?\s*views/i);

      return {
        blocked: false,
        title,
        channel,
        viewsText: viewsMatch ? `${viewsMatch[1]}${viewsMatch[2] || ""}` : "",
      };
    },
  });

  const r = result as any;

  if (r?.blocked) {
    out.notes?.push(r.reason || "YouTube requires manual verification.");
    return out;
  }

  out.topVideoTitle = r.title || undefined;
  out.topChannel = r.channel || undefined;

  if (r.viewsText) {
    out.topViews = parseNumberLike(r.viewsText);
  } else {
    out.notes?.push("Could not parse view count from the first result.");
  }

  return out;
}

export async function scrapeSpotifyPopularity(query: string): Promise<NonNullable<PopularitySignals["spotify"]>> {
  const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  const tab = await openTab(searchUrl, false);

  const out: PopularitySignals["spotify"] = { url: searchUrl, notes: [] };

  if (!tab.id) {
    out.notes?.push("Could not open Spotify tab.");
    return out;
  }

  await waitForTabComplete(tab.id);

  // Step 1: from search page, try to extract first Artist link
  const [{ result: firstLinkRes }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const bodyText = (document.body?.innerText || "").toLowerCase();
      if (bodyText.includes("log in") || bodyText.includes("sign up")) {
        // spotify often still shows content without login, but sometimes blocks
        // We'll continue; this is just a note.
      }

      // Try to find an artist link in search results
      const artistLink =
        (document.querySelector('a[href^="/artist/"]') as HTMLAnchorElement | null)?.href ||
        "";

      return { artistLink };
    },
  });

  const artistLink = (firstLinkRes as any)?.artistLink as string;

  if (!artistLink) {
    out.notes?.push("Could not find an artist link on Spotify search page (may require manual verification).");
    return out;
  }

  out.url = artistLink;

  // Step 2: open artist page and parse "monthly listeners" + verified
  const artistTab = await openTab(artistLink, false);
  if (!artistTab.id) {
    out.notes?.push("Could not open Spotify artist page.");
    return out;
  }

  await waitForTabComplete(artistTab.id);

  const [{ result: artistRes }] = await chrome.scripting.executeScript({
    target: { tabId: artistTab.id },
    func: () => {
      const text = (document.body?.innerText || "").toLowerCase();
      if (text.includes("log in") && text.includes("to continue")) {
        return { blocked: true, reason: "Spotify appears to require login to view monthly listeners." };
      }

      // monthly listeners string usually appears as "... monthly listeners"
      const body = document.body?.innerText || "";
      const mlMatch = body.match(/([\d.,]+)\s*(million|billion|thousand)?\s*monthly listeners/i);

      // verified badge: usually "Verified Artist" appears
      const verified = /verified/i.test(body) && /artist/i.test(body);

      return {
        blocked: false,
        monthlyListenersRaw: mlMatch ? mlMatch[1] : "",
        monthlyListenersSuffix: mlMatch ? mlMatch[2] : "",
        verified,
      };
    },
  });

  const ar = artistRes as any;

  if (ar?.blocked) {
    out.notes?.push(ar.reason || "Spotify popularity requires manual verification.");
    return out;
  }

  out.verified = !!ar.verified;

  // Handle suffix words
  if (ar.monthlyListenersRaw) {
    let txt = String(ar.monthlyListenersRaw).replace(/,/g, "");
    let n = Number(txt);
    if (!Number.isNaN(n)) {
      const suf = String(ar.monthlyListenersSuffix || "").toLowerCase();
      if (suf === "thousand") n *= 1_000;
      if (suf === "million") n *= 1_000_000;
      if (suf === "billion") n *= 1_000_000_000;
      out.monthlyListeners = Math.round(n);
    } else {
      out.notes?.push("Could not parse Spotify monthly listeners number.");
    }
  } else {
    out.notes?.push("Monthly listeners not found on the artist page (layout or access issue).");
  }

  return out;
}