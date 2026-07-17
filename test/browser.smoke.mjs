// End-to-end browser smoke test: loads the app in a real Chromium (Brave),
// uploads a REAL worker sqlite file through the UI, walks the new tables
// (Iteration2 / IterationGroup / Event) and asserts the custom views render
// with decoded names, resolved error refs and working cross-links.
//
// Run: npm run dev (separately) then: node test/browser.smoke.mjs
// or let the script start its own vite (default).
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

// Point at any worker analytics sqlite: `SQLITE_FILE=/path npm run test:browser`,
// or pass it as an arg. Default is a local, gitignored fixture — drop a worker
// file at test/fixtures/sample.sqlite to run out of the box.
const FILE =
  process.env.SQLITE_FILE ??
  process.argv[2] ??
  fileURLToPath(new URL("./fixtures/sample.sqlite", import.meta.url));
const PORT = 4444;
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error("SKIP: no Chromium-based browser found");
  process.exit(0);
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let vite;
const shutdown = () => {
  if (vite && !vite.killed) vite.kill("SIGTERM");
};
process.on("exit", shutdown);

async function main() {
  const url = `http://localhost:${PORT}/stat-viewer2/`;
  let external = await waitForServer(url, 1);
  if (!external) {
    vite = spawn("npx", ["vite", "--port", `${PORT}`], { stdio: "ignore" });
    assert.ok(await waitForServer(url), "vite dev server did not start");
  }

  const browser = await puppeteer.launch({ executablePath, headless: "new" });
  const page = await browser.newPage();
  // Wide viewport: ag-grid virtualizes horizontally off-screen header cells,
  // and the header assertions below need every column in the DOM.
  await page.setViewport({ width: 3800, height: 1000 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`);
  });

  await page.goto(url, { waitUntil: "networkidle2" });

  // Upload the sqlite file through the dropzone input.
  const input = await page.waitForSelector("input[type=file]");
  await input.uploadFile(FILE);
  await page.waitForSelector(".ag-row", { timeout: 30000 });
  console.log("file loaded, first table rendered");

  const clickSidebar = async (label) => {
    await page.evaluate((label) => {
      const links = [...document.querySelectorAll("a")];
      const el = links.find((a) => a.textContent?.trim() === label);
      if (!el) throw new Error(`no sidebar link ${label}`);
      el.click();
    }, label);
    // the breadcrumb flips when the new table page mounted — clicking rows
    // before that hits the previous table's grid
    await page.waitForFunction(
      (label) => document.body.innerText.includes(`${label}'s table`),
      { timeout: 15000 },
      label
    );
    await page.waitForSelector(".ag-row", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
  };

  const openFirstRow = async () => {
    await page.click(".ag-row .ag-cell:nth-child(3)");
    await page.waitForSelector("[role=dialog] table", { timeout: 10000 });
  };
  const dialogText = () => page.$eval("[role=dialog]", (d) => d.textContent ?? "");
  const closeDialog = async () => {
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 300));
  };

  // ── Iteration2 ─────────────────────────────────────────────────────────────
  await clickSidebar("Iteration2");
  const i2Headers = await page.$$eval(".ag-header-cell-text", (els) =>
    els.map((e) => e.textContent?.toLowerCase())
  );
  for (const h of ["tv", "profit", "green", "cex", "manual", "sent"]) {
    assert.ok(i2Headers.includes(h), `Iteration2 grid missing derived column ${h}`);
  }
  // Walk rows until every dialog feature was seen at least once (row 0 can be
  // a failed pair with empty tv results).
  let text = "";
  const seen = { tvTable: false, fit: false, stage: false, sel: false };
  const i2Rows = await page.$$eval(".ag-center-cols-container .ag-row", (r) => r.length);
  for (let i = 0; i < i2Rows && !(seen.tvTable && seen.fit && seen.stage && seen.sel); i++) {
    await page.click(`.ag-center-cols-container .ag-row[row-index="${i}"] .ag-cell:nth-child(3)`);
    await page.waitForSelector("[role=dialog] table", { timeout: 10000 });
    text = await dialogText();
    assert.ok(text.includes("tvResJson"), "dialog missing tvResJson");
    if (text.includes("buyOutRaw")) seen.tvTable = true;
    if (text.includes("vertex=")) {
      if (!seen.fit) await page.screenshot({ path: "test/.build/iteration2-dialog.png" });
      seen.fit = true;
    }
    if (text.includes("stage ")) seen.stage = true;
    if (text.includes("selectedTv")) seen.sel = true;
    await closeDialog();
  }
  assert.ok(seen.tvTable, "no dialog rendered a decoded tvRes table");
  assert.ok(seen.fit, "no dialog rendered the fit plot legend");
  assert.ok(seen.stage, "no dialog rendered the tvStage badge");
  assert.ok(seen.sel, "no dialog rendered decoded selJson");
  console.log("Iteration2 dialogs OK (tvRes table + fit plot + stage + sel)");

  // ── IterationGroup: ladders + probes + pair links ─────────────────────────
  await clickSidebar("IterationGroup");
  const rowCount = await page.$$eval(".ag-center-cols-container .ag-row", (r) => r.length);
  let sawProbes = false;
  let sawLadders = false;
  for (let i = 0; i < rowCount; i++) {
    await page.click(`.ag-center-cols-container .ag-row[row-index="${i}"] .ag-cell:nth-child(3)`);
    await page.waitForSelector("[role=dialog] table", { timeout: 10000 });
    text = await dialogText();
    if (text.includes("amountOutRaw")) sawLadders = true;
    assert.ok(!/#[0-9a-f]{12}(?!:)/.test(text) || text.includes("[#"), "unresolved error ref in group dialog");
    if (text.includes("contextSlot")) {
      sawProbes = true;
      await page.screenshot({ path: "test/.build/group-probes-dialog.png" });
    }
    // pairsJson iteration link opens a stacked Iteration2 dialog
    const linkClicked = await page.evaluate(() => {
      const badge = document.querySelector("[role=dialog] [data-testid=pair-link]");
      if (badge) badge.click();
      return !!badge;
    });
    if (linkClicked) {
      await new Promise((r) => setTimeout(r, 400));
      const t2 = await dialogText();
      assert.ok(t2.includes("groupId"), "pair link did not open Iteration2 entry");
      await closeDialog(); // stacked entry
    }
    await closeDialog();
  }
  assert.ok(sawLadders, "no group dialog rendered the ladders view");
  assert.ok(sawProbes, "no group dialog rendered the probes view");
  console.log("IterationGroup dialogs OK (ladders + probes + pair links)");

  // ── Event → groups links ───────────────────────────────────────────────────
  await clickSidebar("Event");
  const evHeaders = await page.$$eval(".ag-header-cell-text", (els) =>
    els.map((e) => e.textContent?.toLowerCase())
  );
  assert.ok(evHeaders.includes("groups"), "Event grid missing groups column");
  // open the event with groupIds (row with groups=2)
  const evRows = await page.$$(".ag-center-cols-container .ag-row");
  for (const r of evRows) {
    await r.click();
    await page.waitForSelector("[role=dialog] table", { timeout: 10000 });
    text = await dialogText();
    if (text.includes("groupIdsJsonList")) break;
    await closeDialog();
  }
  const groupLinkOpened = await page.evaluate(() => {
    const dialog = document.querySelector("[role=dialog]");
    const badges = [...(dialog?.querySelectorAll("div,span") ?? [])].filter(
      (el) => el.className?.includes?.("cursor-pointer") && /^[a-z0-9]{24}_\d+$/.test(el.textContent ?? "")
    );
    if (badges.length) badges[0].click();
    return badges.length;
  });
  if (groupLinkOpened) {
    await new Promise((r) => setTimeout(r, 400));
    text = await dialogText();
    assert.ok(text.includes("pairsJson") || text.includes("eventNetwork"), "event group link did not open group");
    console.log("Event → group link OK");
  }
  await page.screenshot({ path: "test/.build/event-group-dialog.png" });

  // ── dangling deep-link → visible toast ──────────────────────────────────────
  // Several IterationGroup rows carry an eventId for an event NOT in this file
  // (rotated out). Clicking that link must surface a toast, not fail silently.
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  await clickSidebar("IterationGroup");
  const grpCount = await page.$$eval(".ag-center-cols-container .ag-row", (r) => r.length);
  let sawToast = false;
  for (let i = 0; i < grpCount && !sawToast; i++) {
    await page.click(`.ag-center-cols-container .ag-row[row-index="${i}"] .ag-cell:nth-child(3)`);
    await page.waitForSelector("[role=dialog] table", { timeout: 10000 });
    const clickedEventId = await page.evaluate(() => {
      const dialog = document.querySelector("[role=dialog]");
      const row = [...(dialog?.querySelectorAll("tr") ?? [])].find(
        (tr) => tr.querySelector("td")?.textContent?.trim() === "eventId"
      );
      const badge = row?.querySelector(".cursor-pointer");
      if (badge) badge.click();
      return !!badge;
    });
    if (clickedEventId) {
      await new Promise((r) => setTimeout(r, 250));
      const toastText = await page.$eval("[data-testid=toast]", (el) => el.textContent).catch(() => null);
      if (toastText) {
        assert.ok(/No Event .* in this file/.test(toastText), `unexpected toast text: ${toastText}`);
        sawToast = true;
        await page.screenshot({ path: "test/.build/toast-missing-link.png" });
      }
    }
    await page.keyboard.press("Escape"); // any stacked entry
    await new Promise((r) => setTimeout(r, 150));
    await page.keyboard.press("Escape"); // the group
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.ok(sawToast, "clicking a dangling eventId link did not surface a toast");
  console.log("Missing deep-link toast OK");

  const fatal = pageErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("sourcemap") && !e.includes("DevTools")
  );
  assert.deepEqual(fatal, [], `page errors:\n${fatal.join("\n")}`);

  await browser.close();
  console.log("BROWSER SMOKE OK");
}

main()
  .then(() => {
    shutdown();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    shutdown();
    process.exit(1);
  });
