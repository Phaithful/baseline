import type { QueryType, ResultProfile, EntityType } from "../shared/types";

export type BaselineTask = {
  query: string;
  storefront?: string;

  queryType: QueryType;
  queryElements?: string;
  spelling?: string;
  language?: string;
  disambiguation?: string;

  result: ResultProfile;
  resultMeta?: string;
};

function getText(el: Element | null | undefined) {
  return el?.textContent?.trim() ?? "";
}

function getMetadataValue(label: string) {
  const all = Array.from(document.querySelectorAll("td, th, div, span"));
  for (const el of all) {
    if (el.textContent?.trim() === label) {
      const parent = el.parentElement;
      if (!parent) continue;
      const tds = parent.querySelectorAll("td");
      if (tds.length >= 2) return getText(tds[1]);
      const valueEl = parent.querySelector("td:last-child, span:last-child, div:last-child");
      if (valueEl) return getText(valueEl);
    }
  }
  return "";
}

function normalizeQueryType(raw: string): QueryType {
  const t = (raw || "").trim().toLowerCase();

  // Map Baseline strings to our QueryType union
  if (t === "artist navigational") return "Artist Navigational";
  if (t === "artist functional") return "Artist Functional";

  if (t === "song navigational") return "Song Navigational";
  if (t === "song functional") return "Song Functional";
  if (t === "lyrics") return "Lyrics";

  if (t === "album navigational") return "Album Navigational";
  if (t === "album functional") return "Album Functional";
  if (t === "soundtrack navigational") return "Soundtrack Navigational";

  if (t === "playlist navigational") return "Playlist Navigational";
  if (t === "playlist functional") return "Playlist Functional";

  if (t === "genre/category") return "Genre/Category";

  if (t === "broadcast radio") return "Broadcast Radio";
  if (t === "apple music hosted radio") return "Apple Music Hosted Radio";
  if (t === "editorial radio") return "Editorial Radio";

  if (t === "curator") return "Curator";
  if (t === "record label") return "Record Label";

  if (t === "video navigational") return "Video Navigational";

  if (t === "ambiguous - multiple classifications") return "Ambiguous - Multiple Classifications";
  if (t === "ambiguous - intent unclear") return "Ambiguous - Intent Unclear";

  return "Unknown";
}

function parseIdAndEntity(metaLine?: string) {
  if (!metaLine) return { id: undefined as string | undefined, entityType: "Unknown" as EntityType };

  const idMatch = metaLine.match(/ID:\s*([0-9]+)/i);
  const id = idMatch?.[1];

  let entityType: EntityType = "Unknown";
  if (metaLine.includes("(Song)")) entityType = "Song";
  else if (metaLine.includes("(Album)")) entityType = "Album";
  else if (metaLine.includes("(Playlist)")) entityType = "Playlist";
  else if (metaLine.includes("(Artist)")) entityType = "Artist";
  else if (metaLine.includes("(Video)")) entityType = "Video";

  return { id, entityType };
}

export function parseBaselineTask(): BaselineTask {
  const heading = document.querySelector("h1, h2");
  const headingText = getText(heading);

  let query = headingText;
  let storefront = "";

  const knownStorefronts = ["Canada", "United States", "UK", "Australia"];
  for (const sf of knownStorefronts) {
    if (headingText.endsWith(sf)) {
      storefront = sf;
      query = headingText.slice(0, -sf.length).trim();
      break;
    }
  }

  const queryTypeRaw = getMetadataValue("Query Type");
  const queryType = normalizeQueryType(queryTypeRaw);

  const queryElements = getMetadataValue("Query Elements") || undefined;
  const spelling = getMetadataValue("Spelling") || undefined;
  const language = getMetadataValue("Language") || undefined;
  const disambiguation = getMetadataValue("Disambiguation") || undefined;

  const metaLine = Array.from(document.querySelectorAll("div, span"))
    .map((el) => el.textContent?.trim() ?? "")
    .find((t) => /ID:\s*\d+/.test(t) && /\((Song|Album|Playlist|Artist|Video)\)/.test(t));

  const { id, entityType } = parseIdAndEntity(metaLine);

  const resultTitleEl = document.querySelector("a[href*='music.apple.com'], h3");
  const resultTitle = getText(resultTitleEl) || undefined;

  const resultArtist = getText(resultTitleEl?.parentElement?.querySelector("div, span")) || undefined;

  return {
    query,
    storefront,
    queryType,
    queryElements,
    spelling,
    language,
    disambiguation,
    result: {
      id,
      entityType,
      title: resultTitle,
      artist: resultArtist,
    },
    resultMeta: metaLine,
  };
}