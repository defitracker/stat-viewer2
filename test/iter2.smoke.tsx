// Smoke test for the iteration2 analytics views: loads a REAL worker sqlite
// file, decodes every Iteration2/IterationGroup row, and SSR-renders every
// custom component. Fails loudly (assert) if the decode contract or the
// components break.
//
// Run: npm run test:iter2 [-- /path/to/worker_file.sqlite]
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AN_DECODE,
  TVKIND,
  parseJson,
  deepResolveErrs,
  quoteErrors,
  stageTvs,
  pairFamily,
  decodeIter2Json,
  TvResTable,
  Iter2FitPlot,
  PairsView,
  LaddersView,
  ProbesView,
  renderIter2Value,
} from "../src/components/Iter2Views";

// Point at any worker analytics sqlite: `SQLITE_FILE=/path npm run test:iter2`,
// or pass it as an arg. Default is a local, gitignored fixture — drop a worker
// file at test/fixtures/sample.sqlite to run out of the box.
const file =
  process.env.SQLITE_FILE ??
  process.argv[2] ??
  path.join(process.cwd(), "test/fixtures/sample.sqlite");

const ERR_RE = /"#[0-9a-f]{12}"/;

function rows(db: any, sql: string): Record<string, any>[] {
  const res = db.exec(sql)[0];
  if (!res) return [];
  return res.values.map((v: any[]) => Object.fromEntries(res.columns.map((c: string, i: number) => [c, v[i]])));
}

async function main() {
  const SQL = await initSqlJs({
    locateFile: (f: string) => path.join(process.cwd(), "node_modules/sql.js/dist", f),
  });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  const openEntry = () => {};
  const getElement = (v: any) => <span>{JSON.stringify(v)}</span>;

  // ── pure helpers ──────────────────────────────────────────────────────────
  assert.equal(pairFamily("Base", "CEXGateio"), "cex");
  assert.equal(pairFamily("Solana", "CEXGateio"), "solanaCex");
  assert.equal(pairFamily("CEXGateio", "Solana"), "solanaCex");
  assert.equal(pairFamily("Base", "Solana"), "solana");
  assert.equal(pairFamily("Base", "Ethereum"), "evm");

  // ── QuoteError interning resolves ─────────────────────────────────────────
  const errs = quoteErrors(db);
  const errRows = rows(db, "SELECT id, msg FROM QuoteError");
  assert.equal(errs.size, errRows.length);
  for (const { id, msg } of errRows) {
    assert.equal(deepResolveErrs(`#${id}`, errs), `${msg} [#${id}]`);
  }

  // ── TvsByStage lookup ─────────────────────────────────────────────────────
  for (const { family, stage, tvs } of rows(db, "SELECT family, stage, tvs FROM TvsByStage")) {
    assert.equal(stageTvs(db, family, stage), tvs);
  }

  // ── Iteration2 rows: full decode + SSR render ─────────────────────────────
  const iters = rows(db, "SELECT * FROM Iteration2");
  assert.ok(iters.length > 0, "no Iteration2 rows in test file");
  let plots = 0;
  for (const row of iters) {
    const tvRes = decodeIter2Json("tvResJson", parseJson(row.tvResJson), errs);
    assert.ok(Array.isArray(tvRes));
    for (const r of tvRes) {
      assert.ok(TVKIND.includes(r.kind), `unknown tv kind ${r.kind}`);
      assert.ok("tv" in r && "profit" in r && "buyOutRaw" in r);
    }
    for (const key of ["greenJson", "fitJson", "paJson", "selJson", "gatesJson"]) {
      const parsed = parseJson(row[key]);
      if (parsed == null) continue;
      const dec = decodeIter2Json(key, parsed, errs);
      for (const short of Object.keys(AN_DECODE[key])) {
        assert.ok(!(short in dec), `${key}: short key '${short}' survived decode`);
      }
      // decoded objects keep the same number of top-level keys
      assert.equal(Object.keys(dec).length, Object.keys(parsed).length);
    }
    // fit sanity: stored vertex matches -b/2a of stored coefficients
    const fit = parseJson(row.fitJson);
    if (fit?.ex && fit.ex.every((v: number) => isFinite(v))) {
      const [vertex, , a, b] = fit.ex;
      assert.ok(Math.abs(vertex - -b / (2 * a)) < 1e-3 * Math.max(1, Math.abs(vertex)), "vertex != -b/2a");
      const html = renderToStaticMarkup(<Iter2FitPlot rootCtx={row} />);
      assert.ok(html.includes("vertex="), "fit plot missing vertex legend");
      plots++;
    }
    const html = renderToStaticMarkup(<TvResTable rows={tvRes} />);
    if (tvRes.length) assert.ok(html.includes("grid"), "tvRes table missing grid rows");

    // dispatcher covers every compact column and the meta fields
    for (const key of ["tvResJson", "greenJson", "fitJson", "paJson", "selJson", "gatesJson"]) {
      if (parseJson(row[key]) == null) continue;
      const node = renderIter2Value({
        table: "Iteration2", key, value: row[key], rootCtx: row, db, openEntry, getElement,
      });
      assert.notEqual(node, undefined, `Iteration2.${key} fell through`);
      renderToStaticMarkup(<>{node}</>);
    }
    if (row.greenNetwork) {
      const html = renderToStaticMarkup(
        <>{renderIter2Value({ table: "Iteration2", key: "greenNetwork", value: row.greenNetwork, rootCtx: row, db, openEntry, getElement })}</>
      );
      const expected = row.greenNetwork === "a" ? row.networkA : row.networkB;
      assert.ok(html.includes(expected), "greenNetwork not resolved to full name");
    }
    const stageHtml = renderToStaticMarkup(
      <>{renderIter2Value({ table: "Iteration2", key: "tvStage", value: row.tvStage, rootCtx: row, db, openEntry, getElement })}</>
    );
    assert.ok(stageHtml.includes(`stage ${row.tvStage}`));
  }
  assert.ok(plots > 0, "no fit plot was exercised");

  // ── IterationGroup rows ───────────────────────────────────────────────────
  const groups = rows(db, "SELECT * FROM IterationGroup");
  assert.ok(groups.length > 0, "no IterationGroup rows in test file");
  let probed = 0;
  for (const g of groups) {
    const pairs = parseJson(g.pairsJson) ?? [];
    const pairsHtml = renderToStaticMarkup(
      <PairsView pairs={pairs} networkA={g.eventNetwork} db={db} openEntry={openEntry} />
    );
    for (const p of pairs) {
      assert.ok(pairsHtml.includes(p.id), "pair iteration id missing from PairsView");
      // every pair id must resolve to a real Iteration2 row
      assert.ok(
        rows(db, `SELECT id FROM Iteration2 WHERE id = '${p.id}'`).length === 1,
        `pair ${p.id} has no Iteration2 row`
      );
    }
    const laddersHtml = renderToStaticMarkup(<LaddersView rootCtx={g} errs={errs} />);
    // every interned error ref must render resolved (raw "#hex" never shown)
    assert.ok(!ERR_RE.test(laddersHtml.replace(/&quot;/g, '"')), "unresolved #err ref in ladders view");
    for (const l of parseJson(g.laddersJson) ?? []) {
      assert.ok(laddersHtml.includes(l.net), `ladder network ${l.net} missing`);
    }
    const probes = parseJson(g.probesJson);
    if (Array.isArray(probes)) {
      const html = renderToStaticMarkup(<ProbesView probes={probes} />);
      for (const p of probes) if (p.slot != null) assert.ok(html.includes(`${p.slot}`), "probe contextSlot missing");
      probed++;
    }
    // group ids referenced by events must exist
  }
  assert.ok(probed > 0, "no probesJson exercised (test file should contain solana probes)");

  // ── Event → group links ───────────────────────────────────────────────────
  const events = rows(db, "SELECT * FROM Event WHERE groupIdsJsonList IS NOT NULL");
  assert.ok(events.length > 0, "no events with groupIdsJsonList");
  for (const ev of events) {
    for (const gid of parseJson(ev.groupIdsJsonList) ?? []) {
      assert.ok(
        rows(db, `SELECT id FROM IterationGroup WHERE id = '${gid}'`).length === 1,
        `event ${ev.id} references missing group ${gid}`
      );
    }
  }

  console.log(
    `OK — ${iters.length} Iteration2 rows, ${groups.length} groups, ${events.length} events, ${errs.size} interned errors, ${plots} fit plots`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
