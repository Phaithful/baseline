import type { RunChecksRequest, RunChecksResponse } from "../shared/types";
import { pickIntentClarity, type ResearchContext } from "./engine";
import { handlers } from "./handlers";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Baseline Helper] installed");
});

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  (async () => {
    if (msg?.type !== "RUN_CHECKS") {
      sendResponse({
        ok: false,
        intentClarity: "Unclear",
        evidence: [],
        error: "Unknown message",
      } satisfies RunChecksResponse);
      return;
    }

    const req = msg as RunChecksRequest;

    const intentClarity = pickIntentClarity(req.payload.query, req.payload.disambiguation);

    const ctx: ResearchContext = {
      query: req.payload.query,
      storefront: req.payload.storefront,
      queryType: req.payload.queryType,
      disambiguation: req.payload.disambiguation,
      result: req.payload.result,
      intentClarity,
      evidence: [],
    };

    const handler = handlers[ctx.queryType] ?? handlers["Unknown"];

    await handler.research(ctx);
    const out = handler.decide(ctx);

    const res: RunChecksResponse = {
      ok: true,
      intentClarity: ctx.intentClarity,
      target: ctx.target,
      appleMusic: ctx.appleMusic,
      popularity: ctx.popularity,
      evidence: ctx.evidence,
      suggested: {
        rating: out.rating,
        comment: out.comment,
        confidence: out.confidence,
        usedQueryType: out.usedQueryType,
      },
    };

    sendResponse(res);
  })().catch((e) => {
    sendResponse({
      ok: false,
      intentClarity: "Unclear",
      evidence: [],
      error: e?.message || "Background error",
    } satisfies RunChecksResponse);
  });

  return true;
});