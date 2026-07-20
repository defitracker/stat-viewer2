// Visualization for the iteration2 analytics schema (Iteration2 /
// IterationGroup / TvsByStage / QuoteError tables). Old tables (Iteration,
// Event, Quote) keep their original rendering in [table].tsx — this module
// only adds views for the new compact-JSON columns and decodes their
// shortcut key names (mirror of worker-ui.html AN_DECODE).
import React, { useEffect, useRef } from "react";
import { Database } from "sql.js";
import BigNumber from "bignumber.js";
import ReactJson from "react-json-view";
import functionPlot, { FunctionPlotOptions } from "function-plot";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const FunctionPlot: React.FC<{ options?: FunctionPlotOptions }> = ({ options }) => {
  const rootEl = useRef(null);

  useEffect(() => {
    try {
      functionPlot(Object.assign({}, options, { target: rootEl.current }));
    } catch {
      /* function-plot throws on degenerate domains; skip the plot */
    }
  });

  return <div ref={rootEl} />;
};

// ── decode maps: short row keys → full names (mirror of worker-ui AN_DECODE) ──
export const AN_DECODE: Record<string, Record<string, string>> = {
  greenJson: {
    ga: "greenIsA", k: "sumPoints", sa: "sumBuyOutsA", sb: "sumBuyOutsB",
    f: "forcedOverride", bal: "srcGreenBalance", tg: "greenTokenBalance", tr: "redTokenBalance",
  },
  fitJson: {
    st: "sliceTvs", sp: "sliceProfits", ex: "extremum(vertex,estProfit,a,b,c)",
    lim: "limitedExtremum", vr: "verifyReason", lo: "pairRangeLo", hi: "pairRangeHi",
  },
  paJson: { f: "fires", tv: "interpolatedPaTv", cap: "capTv", fx: "forcedTv" },
  selJson: {
    tv: "selectedTv", p: "profit", src: "source", flt: "filteredCounts",
    bal: "balance", mt: "maxTracking", pa: "paCap", np: "noProfit", rng: "range",
  },
  gatesJson: {
    al: "allowAutomation", rsn: "disallowReason", ep: "eventPercent",
    tafe: "tokenAmountFromEvent", outr: "outranked", err: "buildError",
    sent: "sentAtMs", slip: "appliedDynSlippageBps",
  },
  pairsJson: {
    nb: "networkB", st: "tvStage", asg: "assignedDynamicTvs", lo: "rangeLo",
    hi: "rangeHi", d6: "tvUpdatesDisabled", sg: "stageGrid",
  },
  gridJson: { m: "merged", n: "numPoints" },
  laddersJson: {
    net: "network", src: "srcTokenAddress", err: "error", t: "atMs",
    out: "amountOutRaw", blk: "block", us: "requestUs", resp: "response",
  },
  probesJson: {
    r: "round", i: "index", t: "offsetMs", px: "price", slot: "contextSlot",
    d: "diffPct", f: "fired", e: "error",
  },
};

// tvResJson is positional: [kind, tv, buyRaw, sellRaw, profit, buyErr, sellErr]
export const TVKIND = ["grid", "verify", "verifyOld", "paCap"];
const TVKIND_COLOR = ["#64748b", "#16a34a", "#a855f7", "#ca8a04"];

export function parseJson(v: any): any {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

export function deepRename(v: any, map: Record<string, string>): any {
  if (Array.isArray(v)) return v.map((x) => deepRename(x, map));
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[map[k] ?? k] = deepRename(val, map);
    return out;
  }
  return v;
}

// Quoting errors are interned: rows reference them as "#<12 hex>" and the
// QuoteError table holds the messages once per file.
const ERR_RE = /^#[0-9a-f]{12}$/;
export function deepResolveErrs(v: any, errs: Map<string, string>): any {
  if (typeof v === "string" && ERR_RE.test(v)) {
    const msg = errs.get(v.slice(1));
    return msg ? `${msg} [${v}]` : v;
  }
  if (Array.isArray(v)) return v.map((x) => deepResolveErrs(x, errs));
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[k] = deepResolveErrs(val, errs);
    return out;
  }
  return v;
}

const errCache = new WeakMap<Database, Map<string, string>>();
export function quoteErrors(db: Database): Map<string, string> {
  let m = errCache.get(db);
  if (!m) {
    m = new Map();
    try {
      const res = db.exec("SELECT id, msg FROM QuoteError")[0];
      for (const [id, msg] of res?.values ?? []) m.set(`${id}`, `${msg}`);
    } catch {
      /* old files have no QuoteError table */
    }
    errCache.set(db, m);
  }
  return m;
}

const tvsCache = new WeakMap<Database, Map<string, string>>();
export function stageTvs(db: Database, family: string, stage: number | string): string | undefined {
  let m = tvsCache.get(db);
  if (!m) {
    m = new Map();
    try {
      const res = db.exec("SELECT family, stage, tvs FROM TvsByStage")[0];
      for (const [family, stage, tvs] of res?.values ?? []) m.set(`${family}:${stage}`, `${tvs}`);
    } catch {
      /* old files have no TvsByStage table */
    }
    tvsCache.set(db, m);
  }
  return m.get(`${family}:${stage}`);
}

// Family naming matches worker state/dynamic_tvs.rs: cex = a CEX leg,
// solana = a Solana leg, both = solanaCex, neither = evm.
export function pairFamily(networkA: string, networkB: string): string {
  const isCex = networkA.startsWith("CEX") || networkB.startsWith("CEX");
  const isSolana = networkA === "Solana" || networkB === "Solana";
  return isCex && isSolana ? "solanaCex" : isCex ? "cex" : isSolana ? "solana" : "evm";
}

/// Decode a compact *Json column value: rename shortcut keys, resolve error refs.
export function decodeIter2Json(key: string, parsed: any, errs: Map<string, string>): any {
  let v = parsed;
  if (key === "tvResJson") v = decodeTvRes(v);
  else if (AN_DECODE[key]) v = deepRename(v, AN_DECODE[key]);
  return deepResolveErrs(v, errs);
}

export function decodeTvRes(rows: any[]): any[] {
  return (rows ?? []).map((r) =>
    Array.isArray(r)
      ? {
          kind: TVKIND[r[0]] ?? r[0],
          tv: r[1],
          buyOutRaw: r[2],
          sellOutRaw: r[3],
          profit: r[4],
          buyError: r[5],
          sellError: r[6],
        }
      : r
  );
}

function RawJson({ name, v, collapsed = 2 }: { name: string; v: any; collapsed?: number }) {
  if (v === null || typeof v !== "object") return <Badge variant="outline">{`${v}`}</Badge>;
  return (
    <ReactJson
      name={name}
      src={v}
      collapsed={collapsed}
      enableClipboard={false}
      displayDataTypes={false}
      displayObjectSize={false}
      quotesOnKeys={false}
    />
  );
}

function RawAccordion({ label, value }: { label: string; value: any }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="raw">
        <AccordionTrigger className="text-yellow-600 py-1">{label}</AccordionTrigger>
        <AccordionContent>
          <RawJson name="raw" v={value} collapsed={1} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const num = (v: any, dp = 6) => (typeof v === "number" ? parseFloat(v.toFixed(dp)) : v ?? "");
// Compact UTC clock with milliseconds: "22:21:01.808Z".
const fmtTs = (ms: any) => (typeof ms === "number" ? `${new Date(ms).toISOString().slice(11, 23)}Z` : "");
// Per-amount request duration, always in ms: EVM stores µs, Solana ms.
const fmtTook = (o: any) =>
  o.us != null ? `${(o.us / 1000).toFixed(2)}ms` : o.tookMs != null ? `${o.tookMs}ms` : "";
const profitStyle = (p: any): React.CSSProperties =>
  typeof p === "number" && p > 0 ? { backgroundColor: "rgba(34, 197, 94, 0.12)" } : {};

// Nested data grids size to their content and scroll horizontally (see
// GRID_CLS) rather than wrapping — `whitespace-nowrap` keeps every header and
// cell on one line. `pr-4` gives columns breathing room.
const thCls = "h-8 text-xs whitespace-nowrap pr-4";
const tdCls = "py-1 text-xs font-mono whitespace-nowrap pr-4";
// Passed to each nested <Table>: natural (content) width so columns don't get
// squeezed by the dialog cell; the Table's own overflow-auto wrapper scrolls it.
const GRID_CLS = "w-max";

// ── Iteration2: per-tv results table ────────────────────────────────────────
export function TvResTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <Badge variant="outline">no tv results</Badge>;
  return (
    <Table className={GRID_CLS}>
      <TableHeader>
        <TableRow>
          {["kind", "tv", "buyOutRaw", "sellOutRaw", "profit", "buyError", "sellError"].map((h) => (
            <TableHead key={h} className={thCls}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className={tdCls}>
              <span style={{ color: TVKIND_COLOR[TVKIND.indexOf(r.kind)] ?? undefined, fontWeight: r.kind !== "grid" ? 600 : undefined }}>
                {`${r.kind}`}
              </span>
            </TableCell>
            <TableCell className={tdCls}>{num(r.tv)}</TableCell>
            <TableCell className={tdCls}>{r.buyOutRaw ?? ""}</TableCell>
            <TableCell className={tdCls}>{r.sellOutRaw ?? ""}</TableCell>
            <TableCell className={tdCls} style={profitStyle(r.profit)}>
              {num(r.profit, 8)}
            </TableCell>
            <TableCell className={`${tdCls} text-red-700`}>{r.buyError ?? ""}</TableCell>
            <TableCell className={`${tdCls} text-red-700`}>{r.sellError ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Iteration2: fit plot (feature parity with the old extremumResJson plot) ──
// fitJson.ex = [vertex, estProfit, a, b, c] for profit(tv) = a·tv² + b·tv + c.
export function Iter2FitPlot({ rootCtx }: { rootCtx: Record<string, any> }) {
  const fit = parseJson(rootCtx.fitJson);
  if (!fit) return null;
  const rows: any[][] = (parseJson(rootCtx.tvResJson) ?? []).filter((r: any) => Array.isArray(r));
  const pts = (kind: number) =>
    rows.filter((r) => r[0] === kind && typeof r[4] === "number").map((r) => [r[1], r[4]] as [number, number]);
  const gridPts = pts(0);
  const verifyPts = pts(1);
  const paPts = pts(3);
  const slicePts: [number, number][] = (fit.st ?? [])
    .map((t: number, i: number) => [t, fit.sp?.[i]] as [number, number])
    .filter((p: any[]) => typeof p[1] === "number");
  const ex: number[] | null = Array.isArray(fit.ex) && fit.ex.every((v: any) => isFinite(v)) ? fit.ex : null;

  const all = [...gridPts, ...slicePts, ...verifyPts, ...paPts];
  if (!all.length && !ex) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const maxTv = Math.max(1e-6, ...xs);
  // Include the vertex unless it sits absurdly outside the sampled range.
  const vertexInPlot = ex && Math.abs(ex[0]) <= 3 * maxTv;
  const x1 = Math.min(0, ...xs, vertexInPlot ? ex![0] : 0);
  const x2 = Math.max(maxTv, vertexInPlot ? ex![0] : 0) * 1.05;
  const y1 = Math.min(0, ...ys);
  const y2 = Math.max(0, ...ys, ex ? ex[1] : 0);

  const data: FunctionPlotOptions["data"] = [];
  if (ex) {
    data.push({
      fn: `${BigNumber(ex[2]).toString(10)}x^2 + ${BigNumber(ex[3]).toString(10)}x + ${BigNumber(ex[4]).toString(10)}`,
    });
  }
  const scatter = (points: [number, number][], color: string, r = 3) =>
    points.length && data.push({ fnType: "points", graphType: "scatter", color, attr: { r }, points });
  scatter(gridPts, "red");
  scatter(slicePts, "steelblue", 3.5);
  if (ex && vertexInPlot) scatter([[ex[0], ex[1]]], "purple", 3.5);
  scatter(verifyPts, "green", 3.5);
  scatter(paPts, "darkorange", 3.5);

  return (
    <div>
      <FunctionPlot
        options={{
          target: "",
          width: 600,
          height: 300,
          yAxis: { domain: [y1, Math.max(0.02, y2 * 1.2)] },
          xAxis: { domain: [x1, x2] },
          grid: true,
          data,
        }}
      />
      <div style={{ fontSize: 11, fontFamily: "monospace", padding: "2px 8px" }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: "red" }}>● grid quotes</span>
          <span style={{ color: "steelblue", marginLeft: 10 }}>● fit slice</span>
          {ex && <span style={{ color: "purple", marginLeft: 10 }}>● vertex (est)</span>}
          {verifyPts.length > 0 && <span style={{ color: "green", marginLeft: 10 }}>● verified</span>}
          {paPts.length > 0 && <span style={{ color: "darkorange", marginLeft: 10 }}>● pa cap</span>}
        </div>
        {ex && (
          <span style={{ color: "steelblue" }}>
            vertex={ex[0].toFixed(6)} est={ex[1].toFixed(6)} a={ex[2].toExponential(3)}
          </span>
        )}
        {fit.lim != null && <span style={{ color: "darkorange", marginLeft: 12 }}>lim={num(fit.lim)}</span>}
        {fit.vr != null && <span style={{ color: "gray", marginLeft: 12 }}>verifyReason={`${fit.vr}`}</span>}
        <span style={{ color: "gray", marginLeft: 12 }}>
          range=[{num(fit.lo)} … {num(fit.hi)}]
        </span>
      </div>
    </div>
  );
}

// ── IterationGroup: pairs table with links into Iteration2 ──────────────────
export function PairsView({
  pairs,
  networkA,
  db,
  openEntry,
}: {
  pairs: any[];
  networkA: string;
  db: Database;
  openEntry: (table: string, id: string) => void;
}) {
  const heads = ["iteration", "networkB", "tvStage", "assignedTvs", "lo", "hi", "tvUpdatesOff", "stageGrid"];
  return (
    <Table className={GRID_CLS}>
      <TableHeader>
        <TableRow>
          {heads.map((h) => (
            <TableHead key={h} className={thCls}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairs.map((p, i) => (
          <TableRow key={i}>
            <TableCell className={tdCls}>
              <Badge
                variant="outline"
                data-testid="pair-link"
                className="cursor-pointer bg-blue-300/10 hover:bg-blue-500/30"
                onClick={() => openEntry("Iteration2", p.id)}
              >
                {p.id}
              </Badge>
            </TableCell>
            <TableCell className={tdCls}>{p.nb}</TableCell>
            <TableCell className={tdCls}>
              {p.st}
              {(() => {
                const tvs = stageTvs(db, pairFamily(networkA, `${p.nb ?? ""}`), p.st);
                return tvs ? ` · ${tvs}` : "";
              })()}
            </TableCell>
            <TableCell className={tdCls}>{p.asg ? "yes" : "no"}</TableCell>
            <TableCell className={tdCls}>{num(p.lo)}</TableCell>
            <TableCell className={tdCls}>{num(p.hi)}</TableCell>
            <TableCell className={tdCls}>{p.d6 ? "YES" : ""}</TableCell>
            <TableCell className={tdCls}>{JSON.stringify(p.sg)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── IterationGroup: ladder outs aligned with the merged grid ────────────────
export function LaddersView({ rootCtx, errs }: { rootCtx: Record<string, any>; errs: Map<string, string> }) {
  const ladders = parseJson(rootCtx.laddersJson);
  const grid = parseJson(rootCtx.gridJson);
  const tvs: number[] = grid?.tvs ?? [];
  if (!Array.isArray(ladders)) return null;
  return (
    <div className="flex flex-col gap-3">
      {ladders.map((rawLadder: any, li: number) => {
        const l = deepResolveErrs(rawLadder, errs);
        // A transport-wide ladder failure returns zero outs while the grid has
        // tvs — show one placeholder row per tv (mirrors the worker debug UI)
        // so the grid stays visible instead of collapsing to nothing.
        const rawOuts: any[] = l.outs ?? [];
        const outs = rawOuts.length === 0 && tvs.length > 0 ? tvs.map(() => ({})) : rawOuts;
        const noOuts = rawOuts.length === 0;
        return (
          <div key={li} className="border rounded-md p-2">
            <div style={{ fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>
              <b>{l.net}</b>
              {l.round != null && <span style={{ marginLeft: 8 }}>round {l.round}</span>}
              <span style={{ marginLeft: 8, color: "gray" }}>src {l.src}</span>
              {/* absolute wall-clock: when the ladder fired and finished (fire + wall) */}
              {l.t != null && <span style={{ marginLeft: 8, color: "gray" }}>fired {fmtTs(l.t)}</span>}
              {l.t != null && l.wallMs != null && (
                <span style={{ marginLeft: 8, color: "gray" }}>finished {fmtTs(l.t + l.wallMs)}</span>
              )}
              <span style={{ marginLeft: 8 }}>wall {l.wallMs}ms</span>
              <span style={{ marginLeft: 8 }}>offset {l.offsetMs}ms</span>
              {l.err && <span style={{ marginLeft: 8, color: "#b91c1c" }}>err: {`${l.err}`}</span>}
            </div>
            <Table className={GRID_CLS}>
              <TableHeader>
                <TableRow>
                  {["tv", "amountOutRaw", "block", "took", "error", "response"].map((h) => (
                    <TableHead key={h} className={thCls}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {outs.map((o: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className={tdCls}>{num(tvs[i])}</TableCell>
                    <TableCell className={tdCls}>{o.out ?? (noOuts ? "—" : "")}</TableCell>
                    <TableCell className={tdCls}>{o.blk ?? ""}</TableCell>
                    <TableCell className={tdCls}>{fmtTook(o)}</TableCell>
                    <TableCell className={`${tdCls} text-red-700`}>
                      {o.err ?? (noOuts ? "no quote (ladder failed)" : "")}
                    </TableCell>
                    <TableCell className={tdCls}>
                      {o.resp != null && (
                        <Accordion type="single" collapsible>
                          <AccordionItem value="resp">
                            <AccordionTrigger className="text-yellow-600 py-0 text-xs">response</AccordionTrigger>
                            <AccordionContent>
                              <RawJson name="response" v={o.resp} collapsed={2} />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}

// ── IterationGroup: Solana probe records ─────────────────────────────────────
export function ProbesView({ probes }: { probes: any[] }) {
  const heads = ["round", "#", "offsetMs", "price", "contextSlot", "diffPct", "fired", "error"];
  return (
    <Table className={GRID_CLS}>
      <TableHeader>
        <TableRow>
          {heads.map((h) => (
            <TableHead key={h} className={thCls}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {probes.map((p, i) => (
          <TableRow key={i} style={p.f ? { backgroundColor: "rgba(234, 88, 12, 0.10)" } : {}}>
            <TableCell className={tdCls}>{p.r}</TableCell>
            <TableCell className={tdCls}>{p.i}</TableCell>
            <TableCell className={tdCls}>{p.t != null ? `${p.t}ms` : ""}</TableCell>
            <TableCell className={tdCls}>{p.px ?? ""}</TableCell>
            <TableCell className={tdCls}>{p.slot ?? ""}</TableCell>
            <TableCell className={tdCls}>{num(p.d, 5)}</TableCell>
            <TableCell className={tdCls}>{p.f ? "FIRED" : ""}</TableCell>
            <TableCell className={`${tdCls} text-red-700`}>{p.e ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── dispatcher: custom rendering for Iteration2 / IterationGroup dialog rows ──
// Returns undefined to fall through to the generic renderer in [table].tsx.
export function renderIter2Value(opts: {
  table: string | undefined;
  key: string;
  value: any;
  rootCtx: Record<string, any>;
  db: Database;
  openEntry: (table: string, id: string) => void;
  getElement: (value: any, valueType: null, rootCtx: Record<string, any>, key?: string) => React.ReactNode;
}): React.ReactNode | undefined {
  const { table, key, value, rootCtx, db, openEntry, getElement } = opts;
  if (table !== "Iteration2" && table !== "IterationGroup") return undefined;
  if (value === null || value === undefined || value === "") return undefined;
  const errs = quoteErrors(db);

  // shared meta field (isCex is derived as a grid column, never a stored row key)
  if (key === "isManual") return <Badge variant="outline">{value ? "yes" : "no"}</Badge>;

  if (table === "Iteration2") {
    if (key === "greenNetwork" && (value === "a" || value === "b")) {
      const name = value === "a" ? rootCtx.networkA : rootCtx.networkB;
      return (
        <Badge variant="outline" className="bg-green-300/20">
          {value} → {name}
        </Badge>
      );
    }
    if (key === "tvStage") {
      const fam = pairFamily(`${rootCtx.networkA ?? ""}`, `${rootCtx.networkB ?? ""}`);
      const tvs = stageTvs(db, fam, value);
      return (
        <Badge variant="outline">
          stage {`${value}`}
          {tvs ? ` · ${fam}: ${tvs}` : ""}
        </Badge>
      );
    }
    if (key === "groupId") {
      return (
        <Badge
          variant="outline"
          className="cursor-pointer bg-blue-300/10 hover:bg-blue-500/30"
          onClick={() => openEntry("IterationGroup", `${value}`)}
        >
          {value}
        </Badge>
      );
    }
    if (key === "tvResJson") {
      const rows = decodeIter2Json(key, parseJson(value), errs);
      if (!Array.isArray(rows)) return undefined;
      return (
        <>
          <TvResTable rows={rows} />
          <RawAccordion label="raw tvResJson" value={parseJson(value)} />
        </>
      );
    }
    if (key === "fitJson") {
      const parsed = parseJson(value);
      if (parsed === undefined) return undefined;
      return (
        <>
          <Iter2FitPlot rootCtx={rootCtx} />
          {getElement(decodeIter2Json(key, parsed, errs), null, rootCtx, key)}
        </>
      );
    }
    if (key === "routesJson") {
      const parsed = parseJson(value);
      if (parsed === undefined) return undefined;
      return <RawJson name="routes" v={deepResolveErrs(parsed, errs)} collapsed={2} />;
    }
    // Emitted WIR (manual iters, when analytics.saveWIRforManualIters) — the
    // exact payload the executor got. Rendered as a collapsible JSON tree,
    // same as the raw tvResJson accordion.
    if (key === "wirJson") {
      const parsed = parseJson(value);
      if (parsed === undefined) return undefined;
      return <RawAccordion label="raw wirJson" value={parsed} />;
    }
  }

  if (table === "IterationGroup") {
    if (key === "pairsJson") {
      const pairs = parseJson(value);
      if (!Array.isArray(pairs)) return undefined;
      return (
        <PairsView pairs={pairs} networkA={`${rootCtx.eventNetwork ?? ""}`} db={db} openEntry={openEntry} />
      );
    }
    if (key === "laddersJson") {
      return <LaddersView rootCtx={rootCtx} errs={errs} />;
    }
    if (key === "probesJson") {
      const probes = parseJson(value);
      if (!Array.isArray(probes)) return undefined;
      return <ProbesView probes={probes} />;
    }
  }

  // remaining compact-JSON columns: decode names + resolve error refs, then
  // let the generic nested-table renderer show them.
  if (AN_DECODE[key]) {
    const parsed = parseJson(value);
    if (parsed === undefined || parsed === null) return undefined;
    return getElement(decodeIter2Json(key, parsed, errs), null, rootCtx, key);
  }
  return undefined;
}
