import React, { useEffect, useMemo, useState } from "react";
import { getSettings, setSettings, type Settings } from "./storage";
import type { BaselineTask } from "../parser";
import type {
  EvidenceItem,
  Rating,
  RunChecksRequest,
  RunChecksResponse,
  AppleMusicScrape,
  PopularitySignals,
} from "../../shared/types";

function clampText(s: string, max = 140) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function sendMessage<TReq, TRes>(msg: TReq): Promise<TRes> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (res: TRes) => resolve(res)));
}

export default function App({ task }: { task: BaselineTask }) {
  const [open, setOpen] = useState(true);
  const [settings, setLocalSettings] = useState<Settings>({ autoDraft: true, compact: false });

  const [draft, setDraft] = useState("");
  const [rating, setRating] = useState<Rating>("Good");

  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [appleMusic, setAppleMusic] = useState<AppleMusicScrape | null>(null);
  const [popularity, setPopularity] = useState<PopularitySignals | null>(null);

  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [confidence, setConfidence] = useState<"High" | "Medium" | "Low">("Low");
  const [intentClarity, setIntentClarity] = useState<"Clear" | "Unclear">("Unclear");
  const [error, setError] = useState<string>("");

  const pageTitle = useMemo(() => document.title, []);

  useEffect(() => {
    (async () => setLocalSettings(await getSettings()))();
  }, []);

  useEffect(() => {
    if (!settings.autoDraft) return;
    setDraft(
      [
        `Query: "${task.query || "—"}"`,
        `Query Type: ${task.queryType || "—"}`,
        `Plan: Use Apple Music + external sources to confirm intent, understand the result, then rate using the correct ladder.`,
      ].join("\n")
    );
  }, [settings.autoDraft, task.query, task.queryType]);

  const panelClass =
    "bh-pointer fixed right-3 bottom-3 w-[420px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-xl";

  const runChecks = async () => {
    setRunState("running");
    setError("");
    setEvidence([]);
    setAppleMusic(null);
    setPopularity(null);

    const msg: RunChecksRequest = {
      type: "RUN_CHECKS",
      payload: {
        query: task.query,
        storefront: task.storefront,
        queryType: task.queryType,
        disambiguation: task.disambiguation,
        result: task.result,
      },
    };

    const res = await sendMessage<RunChecksRequest, RunChecksResponse>(msg);

    if (!res?.ok) {
      setRunState("error");
      setError(res?.error || "Unknown error");
      return;
    }

    setRunState("done");
    setEvidence(res.evidence || []);
    setAppleMusic(res.appleMusic ?? null);
    setPopularity(res.popularity ?? null);
    setIntentClarity(res.intentClarity);

    if (res.suggested) {
      setRating(res.suggested.rating);
      setDraft(res.suggested.comment);
      setConfidence(res.suggested.confidence);
    }
  };

  return (
    <div className="bh-pointer">
      {open ? (
        <div className={panelClass}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">Baseline Helper</span>
              <span className="text-xs text-slate-500">{clampText(pageTitle, 60)}</span>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 space-y-2">
              <div>
                <div className="text-xs text-slate-500 mb-1">Query</div>
                <div className="text-sm text-slate-900">{task.query || "—"}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-500">Type:</span> {task.queryType || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Elements:</span> {task.queryElements || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Spelling:</span> {task.spelling || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Language:</span> {task.language || "—"}
                </div>
              </div>

              {task.disambiguation ? (
                <div className="text-xs text-slate-600">
                  <span className="text-slate-500">Disambiguation:</span> {task.disambiguation}
                </div>
              ) : null}

              <div className="text-xs text-slate-600">
                <span className="text-slate-500">Result:</span>{" "}
                {task.result.title || "—"}
                {task.result.artist ? ` — ${task.result.artist}` : ""}
                {task.result.entityType ? ` (${task.result.entityType})` : ""}
                {task.result.id ? ` • ID ${task.result.id}` : ""}
              </div>

              <div className="text-[11px] text-slate-500">Intent clarity (auto): {intentClarity}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={runChecks}
                disabled={runState === "running"}
                className="text-sm py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                {runState === "running" ? "Running…" : "Run checks"}
              </button>

              <button
                onClick={() => {
                  const text = draft.trim();
                  if (!text) return;
                  navigator.clipboard.writeText(text);
                }}
                className="text-sm py-2 rounded-xl bg-slate-900 text-white hover:opacity-90"
              >
                Copy comment
              </button>
            </div>

            <div className="rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Evidence</span>
                <span className="text-[11px] text-slate-500">Confidence: {confidence}</span>
              </div>

              {runState === "error" ? <div className="text-xs text-red-600">{error}</div> : null}

              {evidence.length === 0 ? (
                <div className="text-xs text-slate-500">No evidence yet. Click “Run checks”.</div>
              ) : (
                <ul className="space-y-2">
                  {evidence.map((e, idx) => (
                    <li key={idx} className="text-xs text-slate-700">
                      <span className="font-semibold">{e.source}:</span> {e.title}
                      {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
                      {e.url ? (
                        <div>
                          <a className="text-slate-600 underline" href={e.url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {appleMusic ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-2">
                  <div className="text-xs font-semibold text-slate-700">Apple Music result check</div>
                  <div className="text-xs text-slate-600">
                    {appleMusic.title ? `${appleMusic.title}` : "—"}
                    {appleMusic.artist ? ` — ${appleMusic.artist}` : ""}
                  </div>
                  {appleMusic.tracks?.length ? (
                    <div className="text-[11px] text-slate-500 mt-1">
                      Tracklist scanned: {appleMusic.tracks.length} items (best-effort)
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 mt-1">
                      No tracklist extracted (may require manual check).
                    </div>
                  )}
                  {appleMusic.url ? (
                    <a className="text-xs text-slate-600 underline" href={appleMusic.url} target="_blank" rel="noreferrer">
                      Open Apple Music page
                    </a>
                  ) : null}
                </div>
              ) : null}

              {popularity ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-2 space-y-2">
                  <div className="text-xs font-semibold text-slate-700">Popularity signals</div>

                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">YouTube:</span>{" "}
                    {popularity.youtube?.topViews
                      ? `${popularity.youtube.topViews.toLocaleString()} views (top result)`
                      : popularity.youtube?.notes?.[0] || "—"}
                    {popularity.youtube?.topVideoTitle ? (
                      <div className="text-[11px] text-slate-500">
                        {clampText(popularity.youtube.topVideoTitle, 64)}
                        {popularity.youtube.topChannel ? ` • ${clampText(popularity.youtube.topChannel, 32)}` : ""}
                      </div>
                    ) : null}
                    {popularity.youtube?.url ? (
                      <div>
                        <a className="text-xs text-slate-600 underline" href={popularity.youtube.url} target="_blank" rel="noreferrer">
                          Open YouTube
                        </a>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">Spotify:</span>{" "}
                    {popularity.spotify?.monthlyListeners
                      ? `${popularity.spotify.monthlyListeners.toLocaleString()} monthly listeners`
                      : popularity.spotify?.notes?.[0] || "—"}
                    {typeof popularity.spotify?.verified === "boolean" ? (
                      <span className="text-slate-500"> • {popularity.spotify.verified ? "Verified" : "Not verified/unknown"}</span>
                    ) : null}
                    {popularity.spotify?.url ? (
                      <div>
                        <a className="text-xs text-slate-600 underline" href={popularity.spotify.url} target="_blank" rel="noreferrer">
                          Open Spotify
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-600">Suggested rating</label>
                <select
                  value={rating}
                  onChange={(e) => setRating(e.target.value as Rating)}
                  className="text-xs rounded-lg border border-slate-200 px-2 py-1"
                >
                  <option>Perfect</option>
                  <option>Excellent</option>
                  <option>Good</option>
                  <option>Acceptable</option>
                  <option>Off-topic</option>
                </select>
              </div>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                className="w-full text-sm rounded-xl border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Draft comment will appear here…"
              />
            </div>

            <div className="rounded-xl border border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Settings</span>
                <button
                  onClick={async () => {
                    await setSettings(settings);
                    alert("Saved to chrome.storage.local");
                  }}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                >
                  Save
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.autoDraft}
                  onChange={(e) => setLocalSettings((s) => ({ ...s, autoDraft: e.target.checked }))}
                />
                <span className="text-slate-700">Auto-draft comment</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.compact}
                  onChange={(e) => setLocalSettings((s) => ({ ...s, compact: e.target.checked }))}
                />
                <span className="text-slate-700">Compact mode</span>
              </label>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bh-pointer fixed right-3 bottom-3 rounded-2xl bg-slate-900 text-white px-4 py-2 shadow-lg hover:opacity-90"
        >
          Open Helper
        </button>
      )}
    </div>
  );
}