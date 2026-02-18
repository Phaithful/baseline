import type {
  AppleMusicScrape,
  EvidenceItem,
  IntentClarity,
  PopularitySignals,
  QueryType,
  Rating,
  ResultProfile,
  TargetProfile,
} from "../shared/types";

export type ResearchContext = {
  query: string;
  storefront?: string;
  queryType: QueryType;
  disambiguation?: string;
  result: ResultProfile;

  intentClarity: IntentClarity;

  evidence: EvidenceItem[];

  target?: TargetProfile;
  appleMusic?: AppleMusicScrape;
  popularity?: PopularitySignals;
};

export type HandlerOutput = {
  usedQueryType: QueryType;
  rating: Rating;
  confidence: "High" | "Medium" | "Low";
  comment: string;
};

export type QueryHandler = {
  research: (ctx: ResearchContext) => Promise<void>;
  decide: (ctx: ResearchContext) => HandlerOutput;
};

/**
 * Accuracy-first:
 * - If disambiguation exists, treat as Clear.
 * - If query contains explicit narrowing signals ("by", "feat", etc.), treat as Clear.
 * - Else Unclear, meaning popularity can help choose primary intent.
 */
export function pickIntentClarity(query: string, disambiguation?: string): IntentClarity {
  if (disambiguation && disambiguation.trim()) return "Clear";

  const q = (query || "").toLowerCase();
  if (q.includes(" by ")) return "Clear";
  if (q.includes(" feat") || q.includes(" ft") || q.includes(" featuring")) return "Clear";

  // longer queries are often more specific
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length >= 4) return "Clear";

  return "Unclear";
}