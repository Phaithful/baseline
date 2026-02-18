import type { QueryHandler, ResearchContext, HandlerOutput } from "./engine";
import type { QueryType, TargetProfile, Rating } from "../shared/types";
import {
  addEvidence,
  buildExternalLinks,
  containsTargetByTitle,
  itunesLookupUrlById,
  openTab,
  scrapeAppleMusicTab,
  waitForTabComplete,
  titleMatch,
  initPopularity,
  scrapeSpotifyPopularity,
  scrapeYouTubePopularity,
} from "./research";

async function baselineResearchMinimum(ctx: ResearchContext) {
  const links = buildExternalLinks(ctx.query);

  // External #1: Google
  await openTab(links.googleAppleMusic, false);
  addEvidence(ctx.evidence, {
    source: "Google",
    title: "Opened Google intent check (query + apple music)",
    url: links.googleAppleMusic,
  });

  // External #2: Genius (identity/lyrics)
  await openTab(links.genius, false);
  addEvidence(ctx.evidence, { source: "Genius", title: "Opened Genius (identity/lyrics check)", url: links.genius });

  // Apple Music search
  const appleSearch = `https://music.apple.com/ca/search?term=${encodeURIComponent(ctx.query)}`;
  await openTab(appleSearch, false);
  addEvidence(ctx.evidence, { source: "AppleMusic", title: "Opened Apple Music search", url: appleSearch });

  // Direct result page scrape
  if (ctx.result.id) {
    const url = await itunesLookupUrlById(ctx.result.id, "ca");
    if (url) {
      addEvidence(ctx.evidence, { source: "iTunes", title: `Resolved Apple Music URL from result ID ${ctx.result.id}`, url });

      const tab = await openTab(url, false);
      if (tab.id != null) {
        await waitForTabComplete(tab.id);
        ctx.appleMusic = await scrapeAppleMusicTab(tab.id);
        addEvidence(ctx.evidence, { source: "AppleMusic", title: "Scraped Apple Music result page", url: ctx.appleMusic.url });
      }
    } else {
      addEvidence(ctx.evidence, { source: "ApplePreview", title: "Could not resolve Apple Music URL from result ID", note: "Manual check needed" });
    }
  } else {
    addEvidence(ctx.evidence, { source: "Manual", title: "Result ID missing", note: "Could not auto-open result page; manual check needed." });
  }
}

function inferTargetFromQuery(ctx: ResearchContext, entityType: TargetProfile["entityType"]): TargetProfile {
  const base: TargetProfile = {
    entityType,
    title: ctx.query,
    confidence: ctx.intentClarity === "Clear" ? "Medium" : "Low",
  };
  if (ctx.disambiguation?.trim()) base.confidence = "High";
  return base;
}

function confidenceFromEvidence(ctx: ResearchContext): "High" | "Medium" | "Low" {
  if (ctx.disambiguation?.trim() && ctx.appleMusic?.title) return "High";
  if (ctx.appleMusic?.title) return "Medium";
  return "Low";
}

function isAppleCuratedGuess(title?: string, artistOrOwner?: string) {
  const t = (title || "").toLowerCase();
  const a = (artistOrOwner || "").toLowerCase();

  if (a.includes("apple music")) return true;
  if (t.includes("apple music")) return true;

  if (t.includes("essentials") || t.includes("deep cuts") || t.includes("influences")) return true;

  return false;
}

/** Helper for stubs */
function stub(type: QueryType, msg: string): QueryHandler {
  return {
    research: baselineResearchMinimum,
    decide: () => ({
      usedQueryType: type,
      rating: "Acceptable",
      confidence: "Low",
      comment: msg,
    }),
  };
}

function ratingFromPrimaryIntent(clarity: "Clear" | "Unclear", isPrimary: boolean, exactEntity: boolean): Rating {
  if (exactEntity && isPrimary) return "Perfect";
  if (exactEntity && clarity === "Unclear") return "Excellent";
  if (!exactEntity && isPrimary) return "Good";
  return "Acceptable";
}

async function collectPopularity(ctx: ResearchContext) {
  ctx.popularity = initPopularity();

  // YouTube (best signal)
    const yt = await scrapeYouTubePopularity(ctx.query);
    ctx.popularity.youtube = yt;

    addEvidence(ctx.evidence, {
        source: "YouTube",
        title: "Extracted YouTube top result views (best-effort)",
        url: yt?.url,
        note: yt?.topViews
            ? `Top views: ${yt.topViews.toLocaleString()}`
            : (yt?.notes?.[0] ?? "No views extracted"),
    });

    // Spotify (best-effort)
    const sp = await scrapeSpotifyPopularity(ctx.query);
    ctx.popularity.spotify = sp;

    addEvidence(ctx.evidence, {
        source: "Spotify",
        title: "Extracted Spotify monthly listeners (best-effort)",
        url: sp?.url,
        note: sp?.monthlyListeners
            ? `Monthly listeners: ${sp.monthlyListeners.toLocaleString()}`
            : (sp?.notes?.[0] ?? "No monthly listeners extracted"),
    });
}

export const handlers: Record<QueryType, QueryHandler> = {
  // -------------------------
  // ARTIST
  // -------------------------
  "Artist Navigational": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Artist");

      // Popularity only if intent unclear (tie-break)
      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx): HandlerOutput => {
      const r = ctx.result;
      const t = ctx.target;

      const likelyMatch =
        titleMatch(r.title, t?.title) ||
        titleMatch(r.artist, t?.title) ||
        titleMatch(ctx.appleMusic?.title, t?.title);

      if (r.entityType === "Artist" && likelyMatch) {
        return {
          usedQueryType: "Artist Navigational",
          rating: "Perfect",
          confidence: confidenceFromEvidence(ctx),
          comment: `Intent is a specific artist. The result appears to be the intended artist page, so it fully satisfies the query.`,
        };
      }

      if (r.entityType === "Song" || r.entityType === "Album" || r.entityType === "Playlist") {
        return {
          usedQueryType: "Artist Navigational",
          rating: "Good",
          confidence: "Medium",
          comment: `Intent is a specific artist. The result is related content rather than the artist page, so it only partially satisfies the navigational intent.`,
        };
      }

      return {
        usedQueryType: "Artist Navigational",
        rating: "Off-topic",
        confidence: "Medium",
        comment: `Intent is a specific artist. The result does not appear to match the intended artist or strongly related content.`,
      };
    },
  },

  "Artist Functional": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Artist");

      // Functional often depends on popularity tiers + factual attribute
      await collectPopularity(ctx);
    },
    decide: (ctx) => ({
      usedQueryType: "Artist Functional",
      rating: "Acceptable",
      confidence: "Low",
      comment: `Artist Functional requires verifying the attribute (who qualifies) and applying popularity tiers (very popular/medium/unpopular). Popularity evidence was collected; please confirm the attribute match before finalizing.`,
    }),
  },

  // -------------------------
  // SONG
  // -------------------------
  "Song Navigational": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Song");

      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx) => {
      const r = ctx.result;
      const t = ctx.target;

      const exactish = titleMatch(r.title, t?.title) || titleMatch(ctx.appleMusic?.title, t?.title);

      if (r.entityType === "Song" && exactish) {
        return {
          usedQueryType: "Song Navigational",
          rating: "Perfect",
          confidence: confidenceFromEvidence(ctx),
          comment: `Song Navigational: intent is a specific song. The result matches the intended song entity, so it fully satisfies the query.`,
        };
      }

      if ((r.entityType === "Album" || r.entityType === "Playlist") && containsTargetByTitle(ctx.appleMusic, t)) {
        return {
          usedQueryType: "Song Navigational",
          rating: "Good",
          confidence: "Medium",
          comment: `Song Navigational: the result is a ${r.entityType.toLowerCase()} that contains the intended track, so it partially satisfies the navigational intent (not the exact song entity).`,
        };
      }

      return {
        usedQueryType: "Song Navigational",
        rating: "Off-topic",
        confidence: "Medium",
        comment: `Song Navigational: the result does not match the intended song or an acceptable related container.`,
      };
    },
  },

  "Song Functional": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Song");

      // Functional song queries need popularity + factual constraints
      await collectPopularity(ctx);
    },
    decide: (ctx) => ({
      usedQueryType: "Song Functional",
      rating: "Acceptable",
      confidence: "Low",
      comment: `Song Functional requires validating the specific constraint(s) (e.g., clean/explicit, feature, decade, tempo, etc.) and then applying popularity tiers. Popularity evidence was collected; please confirm the constraint match before finalizing.`,
    }),
  },

  "Lyrics": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Song");
      // Lyrics can also be ambiguous; if unclear, collect popularity
      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx) => {
      // Lyrics uses Song Navigational ladder.
      const r = ctx.result;
      const t = ctx.target;

      const exactish = titleMatch(r.title, t?.title) || titleMatch(ctx.appleMusic?.title, t?.title);

      if (r.entityType === "Song" && exactish) {
        return {
          usedQueryType: "Lyrics",
          rating: "Perfect",
          confidence: confidenceFromEvidence(ctx),
          comment: `Lyrics queries follow Song Navigational ratings. The result matches the intended song implied by the lyric, so it fully satisfies the query.`,
        };
      }

      if ((r.entityType === "Album" || r.entityType === "Playlist") && containsTargetByTitle(ctx.appleMusic, t)) {
        return {
          usedQueryType: "Lyrics",
          rating: "Good",
          confidence: "Medium",
          comment: `Lyrics queries follow Song Navigational ratings. The result is a ${r.entityType.toLowerCase()} that contains the intended song, so it partially satisfies the intent.`,
        };
      }

      return {
        usedQueryType: "Lyrics",
        rating: "Off-topic",
        confidence: "Medium",
        comment: `Lyrics queries follow Song Navigational ratings. The result does not match the intended song implied by the lyric fragment.`,
      };
    },
  },

  // -------------------------
  // ALBUM
  // -------------------------
  "Album Navigational": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Album");

      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx) => {
      const r = ctx.result;
      const t = ctx.target;

      const albumMatch = titleMatch(r.title, t?.title) || titleMatch(ctx.appleMusic?.title, t?.title);

      if (r.entityType === "Album" && albumMatch) {
        return {
          usedQueryType: "Album Navigational",
          rating: "Perfect",
          confidence: confidenceFromEvidence(ctx),
          comment: `Album Navigational: intent is a specific album. The result appears to be the intended album, so it fully satisfies the query.`,
        };
      }

      if (r.entityType === "Song" && albumMatch) {
        return {
          usedQueryType: "Album Navigational",
          rating: "Excellent",
          confidence: "Low",
          comment: `Album Navigational: the result is a song related to the intended album, so it strongly supports the intent but is not the album entity.`,
        };
      }

      if (r.entityType === "Artist") {
        return {
          usedQueryType: "Album Navigational",
          rating: "Good",
          confidence: "Low",
          comment: `Album Navigational: the result is the artist page, which is related but does not directly satisfy the album intent.`,
        };
      }

      return {
        usedQueryType: "Album Navigational",
        rating: "Off-topic",
        confidence: "Medium",
        comment: `Album Navigational: the result does not appear to match the intended album or a strong related substitute.`,
      };
    },
  },

  "Album Functional": stub("Album Functional", "Album Functional: verify the attribute and apply popularity tiers before final rating."),
  "Soundtrack Navigational": stub("Soundtrack Navigational", "Soundtrack Navigational: confirm intended soundtrack/version and apply the soundtrack ladder."),

  // -------------------------
  // PLAYLIST
  // -------------------------
  "Playlist Navigational": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Playlist");

      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx) => {
      const r = ctx.result;
      const t = ctx.target;

      const playlistMatch = titleMatch(r.title, t?.title) || titleMatch(ctx.appleMusic?.title, t?.title);

      if (r.entityType === "Playlist" && playlistMatch) {
        return {
          usedQueryType: "Playlist Navigational",
          rating: "Perfect",
          confidence: confidenceFromEvidence(ctx),
          comment: `Playlist Navigational: intent is a specific playlist. The result appears to be the intended playlist, so it fully satisfies the query.`,
        };
      }

      if (r.entityType === "Song" || r.entityType === "Album" || r.entityType === "Artist") {
        return {
          usedQueryType: "Playlist Navigational",
          rating: "Good",
          confidence: "Low",
          comment: `Playlist Navigational: the result is related content rather than the intended playlist, so it only partially satisfies the navigational intent.`,
        };
      }

      return {
        usedQueryType: "Playlist Navigational",
        rating: "Off-topic",
        confidence: "Medium",
        comment: `Playlist Navigational: the result does not appear to match the intended playlist identity.`,
      };
    },
  },

  "Playlist Functional": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Playlist");
      // functional playlists can benefit from popularity signals when unclear
      if (ctx.intentClarity === "Unclear") await collectPopularity(ctx);
    },
    decide: (ctx) => {
      const q = (ctx.query || "").toLowerCase();
      const rTitle = (ctx.result.title || "").toLowerCase();

      if (q.includes("workout") && (rTitle.includes("chill") || rTitle.includes("chilling"))) {
        return {
          usedQueryType: "Playlist Functional",
          rating: "Off-topic",
          confidence: "High",
          comment: `Playlist Functional: query is for workout content, but the result is a chill playlist which does not satisfy the activity intent.`,
        };
      }

      if (ctx.result.entityType === "Playlist") {
        return {
          usedQueryType: "Playlist Functional",
          rating: "Good",
          confidence: "Low",
          comment: `Playlist Functional: result is a playlist that may satisfy the requested activity/mood/theme. Please verify quickly via the opened Apple Music page before finalizing.`,
        };
      }

      return {
        usedQueryType: "Playlist Functional",
        rating: "Acceptable",
        confidence: "Low",
        comment: `Playlist Functional: result is not a playlist, so it may only weakly satisfy the functional intent. Manual verification needed.`,
      };
    },
  },

  // -------------------------
  // GENRE / CATEGORY
  // -------------------------
  "Genre/Category": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      ctx.target = inferTargetFromQuery(ctx, "Other");

      if (ctx.intentClarity === "Unclear") {
        await collectPopularity(ctx);
      }
    },
    decide: (ctx) => {
      const r = ctx.result;
      const curatedGuess =
        isAppleCuratedGuess(r.title, r.artist) ||
        isAppleCuratedGuess(ctx.appleMusic?.title, ctx.appleMusic?.artist);

      if (r.entityType === "Playlist" && curatedGuess) {
        return {
          usedQueryType: "Genre/Category",
          rating: "Perfect",
          confidence: "Medium",
          comment: `Genre/Category: the result appears to be an Apple-curated/editorial playlist that matches the category intent, so it strongly satisfies the query.`,
        };
      }

      if (r.entityType === "Playlist") {
        return {
          usedQueryType: "Genre/Category",
          rating: "Excellent",
          confidence: "Low",
          comment: `Genre/Category: the result is a playlist that likely matches the category intent. Please verify the genre/theme quickly on Apple Music to confirm.`,
        };
      }

      if (r.entityType === "Radio") {
        return {
          usedQueryType: "Genre/Category",
          rating: "Good",
          confidence: "Low",
          comment: `Genre/Category: a radio result can satisfy category browsing intent, but it is not the strongest match compared to curated playlists/pages.`,
        };
      }

      return {
        usedQueryType: "Genre/Category",
        rating: "Acceptable",
        confidence: "Low",
        comment: `Genre/Category: the result is not a clear category playlist/page/radio match, so it only weakly satisfies the intent.`,
      };
    },
  },

  // -------------------------
  // AMBIGUOUS
  // -------------------------
  "Ambiguous - Intent Unclear": {
    research: async (ctx) => {
      await baselineResearchMinimum(ctx);
      await collectPopularity(ctx);
    },
    decide: (ctx) => {
      const ytViews = ctx.popularity?.youtube?.topViews ?? 0;
      const spML = ctx.popularity?.spotify?.monthlyListeners ?? 0;
      const gotSignals = ytViews > 0 || spML > 0;

      const exactEntity = ["Song", "Album", "Playlist", "Artist"].includes(ctx.result.entityType);
      const isPrimary = true; // Phase 3.2: we still treat result as candidate primary; 3.3 will compare candidates
      const derived = ratingFromPrimaryIntent(ctx.intentClarity, isPrimary, exactEntity);

      return {
        usedQueryType: "Ambiguous - Intent Unclear",
        rating: gotSignals ? (derived === "Acceptable" ? "Good" : derived) : "Good",
        confidence: gotSignals ? "Medium" : "Low",
        comment: gotSignals
          ? `Ambiguous (Intent Unclear): popularity signals were collected (YouTube/Spotify). Use them to identify the most likely primary intent in this storefront and confirm whether the result aligns with that primary intent.`
          : `Ambiguous (Intent Unclear): multiple interpretations are possible. Popularity extraction was blocked or unavailable, so manual verification is required.`,
      };
    },
  },

  "Ambiguous - Multiple Classifications": {
    research: baselineResearchMinimum,
    decide: () => ({
      usedQueryType: "Ambiguous - Multiple Classifications",
      rating: "Acceptable",
      confidence: "Low",
      comment: `Ambiguous (Multiple Classifications): choose the best classification and apply that rating ladder. If you disagree with the provided query type, explain the reclassification in the comment.`,
    }),
  },

  // -------------------------
  // OTHER STUBS (NEXT)
  // -------------------------
  "Broadcast Radio": stub("Broadcast Radio", "Broadcast Radio: confirm station/frequency/market; wrong market/frequency can be off-topic."),
  "Apple Music Hosted Radio": stub("Apple Music Hosted Radio", "Apple Music Hosted Radio: confirm intended station/show/episode before rating."),
  "Editorial Radio": stub("Editorial Radio", "Editorial Radio: confirm intended editorial show/station identity before rating."),
  "Curator": stub("Curator", "Curator: confirm curator identity/page and relevance before rating."),
  "Record Label": stub("Record Label", "Record Label: confirm label identity/page and relevance before rating."),
  "Video Navigational": stub("Video Navigational", "Video Navigational: confirm intended video identity and apply the video navigational ladder."),
  "Unknown": stub("Unknown", "Unknown query type: classify the query type first, then apply the correct ladder."),
};