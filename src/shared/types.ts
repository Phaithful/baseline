export type Rating = "Perfect" | "Excellent" | "Good" | "Acceptable" | "Off-topic";

export type QueryType =
  | "Artist Navigational"
  | "Artist Functional"
  | "Song Navigational"
  | "Song Functional"
  | "Lyrics"
  | "Album Navigational"
  | "Album Functional"
  | "Soundtrack Navigational"
  | "Playlist Navigational"
  | "Playlist Functional"
  | "Genre/Category"
  | "Broadcast Radio"
  | "Apple Music Hosted Radio"
  | "Editorial Radio"
  | "Curator"
  | "Record Label"
  | "Video Navigational"
  | "Ambiguous - Multiple Classifications"
  | "Ambiguous - Intent Unclear"
  | "Unknown";

export type EvidenceSource =
  | "AppleMusic"
  | "ApplePreview"
  | "iTunes"
  | "Genius"
  | "YouTube"
  | "Spotify"
  | "Google"
  | "Manual";

export type EvidenceItem = {
  source: EvidenceSource;
  title: string;
  url?: string;
  note?: string;
};

export type IntentClarity = "Clear" | "Unclear";

export type PopularitySignals = {
  spotify?: {
    url?: string;
    verified?: boolean;
    monthlyListeners?: number; // artist page metric
    notes?: string[];
  };
  youtube?: {
    url?: string;
    topVideoTitle?: string;
    topChannel?: string;
    topViews?: number;
    notes?: string[];
  };
  notes?: string[];
};

export type EntityType =
  | "Song"
  | "Album"
  | "Playlist"
  | "Artist"
  | "Radio"
  | "Video"
  | "Other"
  | "Unknown";

export type ResultProfile = {
  id?: string;
  entityType: EntityType;
  title?: string;
  artist?: string;
};

export type TargetProfile = {
  entityType: EntityType;
  title?: string;
  artist?: string;
  confidence: "High" | "Medium" | "Low";
};

export type AppleMusicScrape = {
  url: string;
  pageTitle?: string;
  title?: string;
  artist?: string;
  tracks?: { title: string; artist?: string }[];
};

export type RunChecksRequest = {
  type: "RUN_CHECKS";
  payload: {
    query: string;
    storefront?: string;
    queryType: QueryType;
    disambiguation?: string;
    result: ResultProfile;
  };
};

export type RunChecksResponse = {
  ok: boolean;
  intentClarity: IntentClarity;

  target?: TargetProfile;
  appleMusic?: AppleMusicScrape;
  popularity?: PopularitySignals;

  evidence: EvidenceItem[];

  suggested?: {
    rating: Rating;
    comment: string;
    confidence: "High" | "Medium" | "Low";
    usedQueryType: QueryType;
  };

  error?: string;
};