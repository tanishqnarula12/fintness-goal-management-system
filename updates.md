# Goal Management — Update Log

Detailed record of three changes so they can be re-implemented in the other copy
of this tool. Each section lists **what changed**, **which file/function**, and
the **exact logic** (not just prose) so it can be ported verbatim.

---

## 1. Projection now runs in **anniversary-year periods** (not calendar years)

### Intent
A goal created on **12 Jun 2026** must project year-by-year from its *start
month*, i.e. rows of:

```
Jun 2026 – Jun 2027
Jun 2027 – Jun 2028
Jun 2028 – Jun 2029
…
```

Previously the projection was bucketed by **calendar year** (Jan–Dec), so the
first row was a stub (Jun–Dec 2026) and step-ups happened every January. Now each
row is a **full 12-month window anchored to the goal's start month**, the SIP
step-up happens on each **anniversary**, and only the *final* row may be partial
(when the target date isn't a whole number of years away).

### Files & functions changed — `src/utils/calc.js`

**(a) `fvOfSipStream` — signature + logic rewritten.**
Old signature: `fvOfSipStream(startSip, startM, startY, tgtM, tgtY, monthlyR, incRate)`
(stepped up on calendar-year boundaries).
New signature: `fvOfSipStream(startSip, totalMonths, monthlyR, incRate)`
(steps up every 12 elapsed months = anniversary):

```js
export function fvOfSipStream(startSip, totalMonths, monthlyR, incRate) {
  if (startSip <= 0 || totalMonths <= 0) return 0;
  let bal = 0;
  let sip = startSip;
  for (let m = 0; m < totalMonths; m++) {
    if (m > 0 && m % 12 === 0) sip = sip * (1 + incRate); // anniversary step-up
    bal = (bal + sip) * (1 + monthlyR);
  }
  return bal;
}
```

**(b) `calcGoal` — updated all three call sites** to the new signature (they now
pass `months` instead of the start/target month-year tuple):
- `const fvOfCurrentSip = fvOfSipStream(currentSip, months, monthlyR, incRate);`
- In the binary search for `sipRequired`: `fvOfSipStream(hi, months, monthlyR, incRate)`
  and `fvOfSipStream(mid, months, monthlyR, incRate)`.

`months = monthsBetween(startM, startY, tgtM, tgtY)` (unchanged; the target month
is exclusive, so Jun 2026 → Jun 2027 = 12 months).

**(c) `buildProjection` — rewritten to emit anniversary rows.** Each row now
carries the fields the UI needs:

```js
export function buildProjection(goal, sipOverride) {
  const startM = goal.createdMonth || CURRENT_MONTH;
  const startY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear;
  const totalMonths = Math.max(0, monthsBetween(startM, startY, tgtM, tgtY));
  const monthlyR = (goal.expectedReturn / 100) / 12;
  const incRate = goal.sipIncRate / 100;
  const rows = [];
  if (totalMonths === 0) return rows;

  const baseAbs = startY * 12 + (startM - 1);       // absolute month index of start
  const startBal = Number(goal.currentInv) || 0;
  const startSip = sipOverride !== undefined ? sipOverride : (Number(goal.currentSip) || 0);
  let bal = startBal;
  let invested = startBal;

  const numPeriods = Math.ceil(totalMonths / 12);
  for (let k = 0; k < numPeriods; k++) {
    const sip = startSip * Math.pow(1 + incRate, k);  // stepped up per anniversary
    const periodStart = k * 12;
    const periodEnd = Math.min((k + 1) * 12, totalMonths);
    const monthsInRow = periodEnd - periodStart;

    const openingBal = bal;
    let rowContribution = 0;
    for (let i = 0; i < monthsInRow; i++) {
      bal = (bal + sip) * (1 + monthlyR);
      rowContribution += sip;
      invested += sip;
    }

    const sAbs = baseAbs + periodStart, eAbs = baseAbs + periodEnd;
    const startMonth = (sAbs % 12) + 1, startYr = Math.floor(sAbs / 12);
    const endMonth = (eAbs % 12) + 1, endYr = Math.floor(eAbs / 12);

    rows.push({
      periodIndex: k,
      startMonth, startYear: startYr,
      endMonth, endYear: endYr,
      startAbs: sAbs, endAbs: eAbs,
      label: `${monthLabel(startMonth, startYr)} – ${monthLabel(endMonth, endYr)}`, // "Jun 2026 – Jun 2027"
      chartName: `${MONTH_NAMES[endMonth - 1]} '${String(endYr).slice(2)}`,          // "Jun '27"
      monthsCovered: monthsInRow,
      isPartial: monthsInRow < 12,
      openingBal,
      monthlySip: sip,
      yearContribution: rowContribution,
      growth: bal - openingBal - rowContribution,
      closingBal: bal,
      totalInvested: invested,
    });
  }
  return rows;
}
```

**Consistency guarantee:** the last row's `closingBal` exactly equals
`calcGoal(goal).projectedCorpus` (verified: `fvOfCurrentInv + fvOfCurrentSip`).

### Consumer changes — `src/components/GoalDetail.jsx`
The old row shape used `r.year` / `r.firstMonth` / `r.lastMonth`. New shape uses
`periodIndex` + `startAbs`/`endAbs` + `label`/`chartName`. Updated:

- **Removed** `projByYear` (Map keyed by calendar year). **Added** `periodOf(dateStr)`
  which finds the period a date falls in via absolute month index
  `dAbs = year*12 + month(0-based)`, matching `dAbs >= r.startAbs && dAbs < r.endAbs`
  (dates past the target clamp to the last period).
- **`projAt(dateStr)`** now interpolates within the found period:
  `frac = (dAbs - r.startAbs) / (r.endAbs - r.startAbs)`, returns
  `openingBal + (closingBal - openingBal) * frac`.
- **Actuals overlay** now keyed by `periodIndex` (`actualByPeriod`) instead of year.
  Synthetic origin dot uses `r.periodIndex === 0`.
- **Chart x-axis** uses `r.chartName` (e.g. `Jun '27`).
- **Projection table**: header `Year` → `Period`; the cell renders `r.label`
  (e.g. `Jun 2026 – Jun 2027`) with the partial-period `Info` tooltip using
  `r.monthsCovered`.
- Removed now-unused import `MONTH_NAMES` (and `goalIcon`, `achievementColor`).

---

## 2. Negative **Additional SIP** shows in **red**

### Intent
`additionalSip = sipRequired − currentSip` is **signed**. When it's negative
(client is over-funded, e.g. `-₹2,989`), display it in red.

### Where it renders as a raw number (all styled red for negatives)
- **`src/components/GoalDetail.jsx`** — the `Metric` tile:
  `<Metric label="Additional SIP" value={fmtSip(c.additionalSip)+'/mo'} negative={c.additionalSip < 0} />`.
  The `Metric` component paints rose text + rose border/background when `negative`.
- **`src/components/ClientDetail.jsx`** — the per-goal `KV`:
  `<KV label="Additional SIP" value={fmtSip(c.additionalSip)+'/mo'} highlight negative={c.additionalSip < 0} />`.
  `KV` renders rose text when `highlight && negative`.
- **`src/components/ClientDetail.jsx`** — the **aggregate SIP `SummaryTile`** (the
  "Additional SIP Required · ₹-3,865/mo" card). Added a `rose` accent to `SummaryTile`
  and switched the tile to it when the total is negative:
  `<SummaryTile label="Additional SIP Required" value={…} accent={totals.totalAdditional < 0 ? 'rose' : 'indigo'} />`.
  The new accent: `rose: 'bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 shadow-sm'`.

### Where it is intentionally NOT a red number
`src/components/GoalsOverview.jsx`, `src/components/ReportsView.jsx`, and the
`GoalFormModal` preview show a green **"On track"** pill whenever
`sipOnTrack` is true (`currentSip >= sipRequired − 0.5`). Because a negative
additional SIP always implies `sipOnTrack === true`, these views surface the
surplus as the green pill rather than a red number by design. If the number
itself is wanted here, replace the pill branch with
`<span className={c.additionalSip < 0 ? 'text-rose-600 dark:text-rose-400' : '…'}>`.

---

## 3. **Map Asset** — seed a goal's corpus from the client's Asset Allocation

### Intent
In the goal form, under **Existing Accumulated Corpus**, show a **"Map Asset"**
checkbox (only if the client has asset-allocation holdings). When ticked, it
lists every asset (financial + physical) with its **current value**, plus an
**amount** input per asset. The sum of mapped amounts is **added to the goal's
corpus**, and every calculation (SIP, projection, achievement) uses that larger
corpus.

### Data model decision (important for porting)
Mapped amounts are **folded into `currentInv`** on save — there is **no new DB
column and no migration**. The effective corpus persists as the goal's
`currentInv`, so it works identically on both the Supabase and localStorage
backends. Trade-off: the per-asset breakdown is **not** stored, so re-opening a
goal shows the combined corpus with the panel reset (unchecked). This avoids
double-counting: mapping only adds on an explicit, non-zero entry.
*(If you need the breakdown persisted, add a `mapped_assets JSONB DEFAULT '[]'`
column to the `goals` table, thread it through `mapDbGoal`/`mapFrontendGoal` in
`src/services/db.js`, and compute `effectiveCurrentInv = currentInv + Σ mapped`
in `calcGoal`/`buildProjection` instead of folding on save.)*

### Files changed

**`src/App.jsx`** — pass the client's allocation into the modal:
```jsx
<GoalFormModal
  initial={…}
  assetAllocation={selectedClient.assetAllocation}
  …
/>
```

**`src/components/Modals.jsx` → `GoalFormModal`**
- New import: `import { filledItems } from '../utils/assets';` and icons `Link2, Wallet`.
- New prop `assetAllocation`.
- Build the holdings list (financial + physical only; liabilities excluded).
  `filledItems(alloc, sectionId)` returns `{ label, amount, group, groupId, color, isCustom }`:
  ```js
  const assetHoldings = useMemo(() => {
    if (!assetAllocation) return [];
    return ['financial', 'physical'].flatMap(sid =>
      filledItems(assetAllocation, sid).map(it => ({ ...it, sectionId: sid }))
    );
  }, [assetAllocation]);
  const hasAssets = assetHoldings.length > 0;
  ```
- State: `mapOpen` (checkbox), `mapAmt` (`{ [assetLabel]: amountString }`).
- Total + effective corpus:
  ```js
  const mappedTotal = assetHoldings.reduce((s, a) => {
    const raw = Number(String(mapAmt[a.label] ?? '').replace(/,/g, ''));
    return s + (mapOpen && isFinite(raw) && raw > 0 ? raw : 0);
  }, 0);
  const effectiveCurrentInv = (Number(form.currentInv) || 0) + mappedTotal;
  ```
- Live preview uses it: `calcGoal({ ...form, name: effectiveName, currentInv: effectiveCurrentInv })`.
- On save: `currentInv: effectiveCurrentInv` (mapped amounts folded in).
- The **Existing Accumulated Corpus** field shows a hint when mapping is active:
  `Typed + ₹X mapped = ₹Y effective`.
- UI panel (only when `hasAssets`): a checkbox row + a bordered panel listing each
  asset (colour dot · label · current value) with a `₹` amount input (`max` = asset
  value), an **"All"** button that fills the full value, and a **"Mapped to corpus"**
  total footer.

### Behaviour summary
Tick **Map Asset** → enter/allocate amounts against assets → the preview tiles and,
after save, the whole goal calculation reflect `currentInv + mappedTotal`.

---

## 4. **Create Log actuals now feed the calculations** (plan re-basing)

### Intent
Previously a logged actual portfolio value (Create Log) only drew a dotted line on
the chart. Now the **latest logged value re-bases the whole plan**: from that date
onward the corpus starts at the logged amount and the remaining SIP / projection /
achievement are recomputed — so the tool stays accurate as reality is recorded.

### Design
- Anchor = the **most recent** actual entry (by date). If none, anchor = goal creation.
- The **goal cost inflation** stays anchored to the **creation date** (the target future
  value is fixed): `futureValue = amount * (1+monthlyInfl)^inflationMonths`, where
  `inflationMonths = monthsBetween(created → target)`.
- The **corpus growth + SIP stream + projection** run over the **remaining horizon**
  `months = monthsBetween(anchor → target)`, starting from the anchored corpus.

### Files & functions — `src/utils/calc.js`

**New helper `goalAnchor(goal)`** picks the anchor:
```js
export function goalAnchor(goal) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const actuals = Array.isArray(goal.actuals) ? goal.actuals : [];
  let latest = null;
  actuals.forEach(a => {
    const d = new Date(a.date);
    if (isNaN(d.getTime())) return;
    if (!latest || d > new Date(latest.date)) latest = a;
  });
  if (latest) {
    const d = new Date(latest.date);
    const am = d.getMonth() + 1, ay = d.getFullYear();
    if (monthsBetween(createdM, createdY, am, ay) >= 0)
      return { anchorM: am, anchorY: ay, anchorInv: Number(latest.amount) || 0, rebased: true };
  }
  return { anchorM: createdM, anchorY: createdY, anchorInv: Number(goal.currentInv) || 0, rebased: false };
}
```

**`calcGoal`** now:
- computes `inflationMonths` (creation→target) for `futureValue` only;
- takes `{ anchorM, anchorY, anchorInv, rebased } = goalAnchor(goal)`;
- sets `months = monthsBetween(anchor→target)` and `currentInv = anchorInv`;
- everything else (fvOfCurrentInv, fvOfCurrentSip, sipRequired, lumpSum, achievement)
  uses `months` / `currentInv` as before;
- returns extra fields: `rebased, anchorInv, anchorMonth, anchorYear`.

**`buildProjection`** anchors the same way:
`const { anchorM: startM, anchorY: startY, anchorInv } = goalAnchor(goal);` and
`startBal = anchorInv;` (instead of `goal.currentInv`). The rest is unchanged, so the
projection table/chart start at the logged value and stay consistent with the summary
(last row `closingBal === calcGoal.projectedCorpus`).

### Consumer — `src/components/GoalDetail.jsx`
- Chart origin corpus: `startCorpus = projection.length ? projection[0].openingBal : (goal.currentInv || 0)`.
- Added a note under the achievement bar when `c.rebased`:
  *"Plan re-based to your latest logged value ₹X as of Mon YYYY — SIP, projection &
  achievement are recomputed from there."*

### Verified behaviour
For a goal (₹50L target, 10 yr, 12% / 10% step-up, ₹5L corpus, ₹25k SIP):
- **no actuals** → `additionalSip` unchanged, `rebased=false`.
- **log ₹25L in Jul 2028** → re-based to Jul 2028, achievement 100%, additional SIP
  drops (over-funded), projection starts at ₹25L.
- **log ₹6L in Jul 2028** → achievement 76.9%, additional SIP rises (behind plan).

Weaker logged values increase the required SIP; stronger ones reduce it. The logged
value now genuinely drives every number, not just the graph.

**Correction (superseded above):** the first version of this feature shifted the
*entire projection grid* to start at the logged actual's date, so a goal created
Jun 2025 with a log entry in Jun 2026 showed a table starting at "Jun 2026 – Jun 2027"
— the Jun 2025 – Jun 2026 row disappeared. That's wrong: **the period grid must
always start at the goal's creation date** (per section 1), regardless of any
logged actuals. Fixed by decoupling the grid from the correction:

- `buildProjection` and the new lean `finalBalance` (used by `calcGoal`) both build
  their period grid from `goal.createdMonth/createdYear` **unconditionally** — never
  from the anchor.
- The logged-actual correction is applied **inside** the month-by-month loop instead:
  at the exact absolute month index that matches the latest actual's date, the
  running balance is snapped to that logged value, then compounding resumes from
  there for the rest of the loop. The row grid itself never moves.
- If the logged date lands exactly on a row boundary (the common case — advisors
  usually log at/near an anniversary), that row's **Opening Bal** column is set to
  the corrected value directly (rather than the pre-correction previous-row closing),
  so e.g. logging ₹10.18L on 15 Jun 2026 makes the "Jun 2026 – Jun 2027" row show
  Opening Bal ₹10.18L. A log landing mid-row still corrects the trajectory, it's just
  reflected as a bigger jump in that row's "Estimated Growth" column instead of the
  opening figure (splitting a row at an arbitrary mid-year date was judged not worth
  the complexity for a 12-month-block table).
- `calcGoal` no longer duplicates the growth formula in closed form (`fvOfSipStream`
  removed). It now calls a lean, allocation-free `finalBalance(goal, sipOverride)`
  — identical month-by-month math to `buildProjection`, minus the row objects — so
  `calcGoal.projectedCorpus` and `buildProjection(goal)`'s last row `closingBal`
  are **always numerically identical** (single source of truth, verified in testing).
  `sipRequired` is found via binary search calling `finalBalance(goal, candidateSip)`
  (~60 iterations; cheap since it's a flat scalar loop, no object allocation).
- `lumpSumRequired` is unchanged from the previous version: it's a distinct concept
  (a hypothetical top-up invested *today*, i.e. at the anchor) and still uses
  `monthsBetween(anchor → target)` with `anchorInv` as the base.
- `goal.currentMonth/currentYear` (used for `months`/`years`/"Planning Horizon") is
  back to being the full creation→target horizon — matching the app's original,
  pre-any-of-this-session behaviour (it was never "time remaining from today," so no
  regression there).

---

## 5. Map Asset row layout — fixed label truncation on narrow widths

### Bug
On the Map Asset panel (section 3), each asset row was a single `flex` line with
`min-w-0 flex-1` wrapping the label+value and `shrink-0` on the amount input + "All"
button. At narrow viewport widths the fixed-width input/button starved the label of
space and the browser truncated it down to a single character (e.g. "Indian Equity"
→ "I.", "Fixed Deposits (FDs)" → "F").

### Fix — `src/components/Modals.jsx`, the `assetHoldings.map(...)` block
Changed the row from a single non-wrapping flex line to `flex flex-wrap`, so when
there isn't enough horizontal room, the amount-input + "All" button group wraps to
its own line **below** the label instead of crushing it:
- Row wrapper: `flex items-center gap-3` → `flex flex-wrap items-center gap-x-3 gap-y-2 py-1`.
- Label block: `min-w-0 flex-1` → `min-w-[140px] flex-1 basis-40`; removed `truncate`,
  added `break-words` (long custom labels wrap instead of vanishing).
- Amount input width: `w-36` → `w-32 sm:w-36` (a bit narrower on small screens).
- Input + "All" button now share a `flex items-center gap-2 ml-auto shrink-0`
  container so they stay grouped together and push right, wrapping as a unit.

---

## 6. Asset availability across goals — "how much of this asset is left to map?"

### Intent
Map Asset (section 3) let an advisor pledge part of a client's asset toward a
goal's corpus, but gave no visibility into whether that asset was *already*
pledged to another goal. If a client has ₹10L of "Stocks / Shares" and Goal A
already maps ₹2L of it, opening Goal B's Map Asset panel must show only ₹8L
**available**, and must say which other goal(s) are using the rest.

### Data model change (breaking, requires migration — see §8)
Previously (documented in §3 above) a mapped amount was **folded into
`currentInv` on save** and the per-asset breakdown was discarded. That made
cross-goal availability impossible to compute. Now:

- Each goal stores its own `mappedAssets: [{ id, sectionId, label, amount }]`
  array, kept **separate** from `currentInv` (the manually-typed corpus).
- The calculation engine (`goalStartingCorpus`, see §7) sums `currentInv +
  Σ mappedAssets` at simulation time instead of relying on a single merged
  number — so nothing is lost by keeping them separate.

### Files changed

**`src/components/Modals.jsx` → `GoalFormModal`**
- New prop `clientGoals` (the client's full goal list, passed from
  `src/App.jsx`: `<GoalFormModal … clientGoals={selectedClient.goals} />`).
- `usageByLabel` — a memo that, for every asset label, lists which of the
  client's **other** goals (excluding the one currently being edited, matched
  by `id`) have it mapped and for how much:
  ```js
  const usageByLabel = useMemo(() => {
    const map = {};
    (clientGoals || []).forEach(g => {
      if (initial && g.id === initial.id) return; // don't count the goal being edited against itself
      (g.mappedAssets || []).forEach(a => {
        const amt = Number(a.amount) || 0;
        if (amt <= 0) return;
        if (!map[a.label]) map[a.label] = [];
        map[a.label].push({ goalName: g.name, amount: amt });
      });
    });
    return map;
  }, [clientGoals, initial]);
  ```
- Per asset row: `usedElsewhere = Σ usageByLabel[label].amount`,
  `available = max(0, asset.amount - usedElsewhere)`. The row now shows
  **"available / total"** (e.g. "₹8.00 L / ₹10.00 L") — green when fully
  available, amber when partially used — and, if `usedElsewhere > 0`, a line
  underneath: *"Already used by: Goal A (₹2.00 L)"*. The amount input's `max`
  is set to `available` (not the full asset value), the "All" button fills
  `available` (not the full value), and typing **more** than `available`
  shows a red border plus *"Exceeds available balance by ₹X"* — a soft
  warning, not a hard block (an advisor might deliberately over-commit and
  fix the source allocation later).
- On save, `mappedAssetsPayload` (only entries with `amount > 0`) is written
  to `goal.mappedAssets` — `currentInv` is saved as typed, untouched.
- When editing an existing goal, `mapOpen`/`mapAmt` are pre-filled from
  `initial.mappedAssets` so re-opening the form shows what's already mapped.

**`src/utils/calc.js`**
- `buildGoalEdits` now logs a "Mapped assets total" line when a goal's total
  mapped amount changes (compares before/after totals, not itemized — kept
  simple, matching the existing edit-history style).

---

## 7. Planning Assumptions now shows which asset is used in which goal

### Files changed

**`src/utils/calc.js` → `buildAssumptionsBlock`**
Added a new auto-generated section, appended after the existing
Inflation/Expected-Return/SIP-step-up blocks:
```
Mapped Assets:
  • Vacation: Stocks / Shares (₹20,00,000)
  • Financial Freedom: Fixed Deposits (FDs) (₹15,00,000), Gold ETFs (₹5,00,000)
```
(or `No assets mapped to any goal yet.` if none). `refreshAssumptionsText`'s
`headerRegex` was extended to recognise `Mapped Assets:` as a block header too,
so editing/refreshing the auto-generated block doesn't leave stale copies
behind or swallow it into the freeform notes.

**`src/components/ClientDetail.jsx`**
- `getQualitativeNotes` (which strips the auto-generated block out of the
  combined text to isolate the advisor's freeform notes) now also strips
  `Mapped Assets:` lines, so that section doesn't leak into "Qualitative
  Planning Notes".
- The always-visible **Quantitative Rates Matrix** table (no click-through
  needed) gained a **"Mapped Assets"** column showing each goal's mapped
  holdings as small indigo chips (`AssetLabel · ₹amount`), or *"None"* in
  italics if the goal has no mapped assets.

---

## 8. Calculation bug fix — Create Log now feeds a real contribution ledger

### The bug
The previous "Create Log" (§4 in the prior session) logged an **absolute
portfolio snapshot** ("the portfolio is worth ₹X on date Y") and re-based the
whole plan to the *latest* snapshot. That had two problems the user flagged:
1. It only supported one kind of entry (a value), with no way to say *why* the
   corpus moved — was it a lump-sum deposit, or an ongoing SIP change?
2. Only the graph reflected it in some views; the modeling was a blunt
   "snap to last value," not a proper transaction ledger, so intermediate
   contributions between snapshots were invisible to the maths.

### The fix — Create Log is now a contribution ledger
Each entry is one of two **signed** transaction types (sign = increase/decrease):
- **Lumpsum** — a one-time amount added to (positive) or withdrawn from
  (negative, "minus is for decrease") the corpus on that exact date.
- **SIP** — a **permanent** change to the ongoing monthly SIP from that date
  forward (positive = increase, negative = decrease). Multiple SIP entries
  stack (cumulative).

Every entry is applied **inside the month-by-month simulation** at its exact
month, so it genuinely changes `sipRequired`, `additionalSip`,
`achievementPct`, `projectedCorpus`, and the projection table/chart — not just
a chart annotation.

### Files & functions — `src/utils/calc.js` (full engine rewrite)

**`goalStartingCorpus(goal)`** — `currentInv + Σ mappedAssets` (see §6).

**`contributionEvents(goal)`** — parses `goal.contributions` into simulation-
ready shape: a `Map<absoluteMonth, summedLumpsum>` and a date-sorted list of
`{ absMonth, delta }` SIP changes:
```js
function contributionEvents(goal) {
  const contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
  const lumpsumByMonth = new Map();
  const sipDeltas = [];
  contributions.forEach(c => {
    const d = new Date(c.date);
    if (isNaN(d.getTime())) return;
    const amt = Number(c.amount) || 0;
    if (!amt) return;
    const absMonth = d.getFullYear() * 12 + d.getMonth();
    if (c.type === 'lumpsum') lumpsumByMonth.set(absMonth, (lumpsumByMonth.get(absMonth) || 0) + amt);
    else if (c.type === 'sip') sipDeltas.push({ absMonth, delta: amt });
  });
  sipDeltas.sort((a, b) => a.absMonth - b.absMonth);
  return { lumpsumByMonth, sipDeltas };
}
```

**`simulate(goal, { sipOverride, buildRows })`** — the **single** month-by-month
engine (replaces the previous session's duplicated `finalBalance` +
`buildProjection` pair, which risked drifting apart — exactly the kind of
"bug in calculation" the user flagged). Grid always starts at goal creation
(per §1 from the prior session); the SIP steps up on each creation
anniversary; a running `cumSipDelta` walks the sorted SIP-delta list forward
in lockstep with the month loop (an O(months + events) merge, not a rescan);
a lump-sum found for the current absolute month is added straight into `bal`.
When `buildRows` is true it also computes each row's `targetValue` — the
inflated goal cost *as of that row's end date* (used for the new chart line,
see §9) — which reaches exactly `futureValue` on the final row.
```js
function simulate(goal, { sipOverride, buildRows = false } = {}) {
  // … totalMonths / monthlyR / incRate / monthlyInfl setup …
  const { lumpsumByMonth, sipDeltas } = contributionEvents(goal);
  let bal = startCorpus, invested = startCorpus, sipPtr = 0, cumSipDelta = 0;
  for (let k = 0; k < numPeriods; k++) {
    const baseSip = startSip * Math.pow(1 + incRate, k);
    for (let i = 0; i < monthsInRow; i++) {
      const mAbs = baseAbs + periodStart + i;
      while (sipPtr < sipDeltas.length && sipDeltas[sipPtr].absMonth <= mAbs) {
        cumSipDelta += sipDeltas[sipPtr].delta; sipPtr++;
      }
      const sip = Math.max(0, baseSip + cumSipDelta); // SIP never goes negative
      const lump = lumpsumByMonth.get(mAbs) || 0;
      if (lump) { bal += lump; invested += lump; rowContribution += lump; }
      bal = (bal + sip) * (1 + monthlyR);
      rowContribution += sip; invested += sip;
    }
    // … push row with targetValue, or just track bal for the scalar-only path …
  }
  return { rows: rows || [], closingBal: bal };
}
export function buildProjection(goal, sipOverride) { return simulate(goal, { sipOverride, buildRows: true }).rows; }
```

**`calcGoal`** — `projectedCorpus = simulate(goal).closingBal`;
`sipRequired` binary-searches over `simulate(goal, { sipOverride }).closingBal`
(holding all logged contributions fixed — i.e. "what would the **base**
monthly SIP need to be, given everything logged so far, to hit the target?");
`lumpSumRequired` is a distinct hypothetical ("a one-time top-up on the
starting corpus") using the full creation→target horizon, unchanged in spirit
from the original pre-session formula. Returns `hasContributions` /
`hasMappedAssets` flags for the UI note instead of the removed
`rebased`/`anchorInv`/`anchorMonth`/`anchorYear` fields.

**Removed:** `goalAnchor` (the old single-snapshot re-basing helper),
`fvOfSipStream` (the old closed-form SIP-stream formula) — both fully
superseded by `simulate`.

### Files changed — `src/components/GoalDetail.jsx`
- `CreateLog` rewritten: a **Type** selector (Lumpsum / SIP), **Date**, and a
  signed **Amount** field (native number input, so a leading `-` is typed
  directly — no separate +/- toggle). An **ⓘ info button** next to the
  "Create Log" heading toggles an explanation panel describing both entry
  types (exact copy is in `CONTRIB_TYPES` at the top of the file, edit there
  to change the wording). The ledger table shows Date / Type badge
  (amber=Lumpsum, indigo=SIP) / signed Amount (green if positive, red if
  negative, `/mo` suffix for SIP rows) / Edit / Delete.
- Removed the old "actual vs projected, ahead/behind" comparison entirely —
  there's no more separate "actual value" to compare against a projection;
  the contributions themselves **are** the plan now, so `periodOf`/`projAt`/
  `actualByPeriod`/`ActualDot` were deleted along with it.
- The note under the achievement bar changed from "Plan re-based to…" to a
  simpler *"Includes logged contributions… / mapped assets… in the
  calculation below"*, driven by `calcGoal`'s new `hasContributions` /
  `hasMappedAssets` flags.
- Added a **Mapped Assets** chip row in the hero card (visible whenever
  `hasMappedAssets`), and swapped the "Current corpus" mini-stat for
  **"Starting corpus"** (`c.startCorpus` = `currentInv + Σ mappedAssets`,
  the actual number the simulation starts from).

### Files changed — `src/App.jsx`
- `onSaveActuals` → **`onSaveContributions`**: `GoalDetail`'s save callback
  now writes `{ contributions, history }` instead of `{ actuals, history }`.
- `<GoalFormModal>` now also receives `clientGoals={selectedClient.goals}`
  (needed for §6's cross-goal availability).

### Files changed — `src/services/db.js`
`mapDbGoal` / `mapFrontendGoal` / `updateGoal` all gained `mappedAssets` ↔
`mapped_assets` and `contributions` ↔ `contributions` translation, following
the exact same pattern as every other goal field. The old `actuals` column
mapping is **left in place, untouched** — old snapshot log entries aren't
deleted, they're just no longer read by the calculation engine (harmless,
inert data).

### ⚠️ Required migration (Supabase only — confirmed necessary by testing)
New file **`migration_goal_contributions.sql`** adds two columns to the
`goals` table:
```sql
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS mapped_assets JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS contributions JSONB NOT NULL DEFAULT '[]'::jsonb;
```
**Run this once in the Supabase SQL editor before using Map Asset or Create
Log on a Supabase-backed deployment** — I confirmed by direct query that
saving a goal without it fails with `column goals.mapped_assets does not
exist` (a clean `400`, caught by the existing `try/catch` → `alert(...)` in
`App.jsx`, so it fails safely rather than crashing — but the feature won't
persist until the migration runs). The localStorage fallback needs no
migration; new fields just flow through automatically.

### Verified (all via direct Node execution against the real `calc.js`, plus a live browser check)
- Mapped assets correctly seed the starting corpus (`goalStartingCorpus` /
  first row `openingBal`).
- A lump-sum contribution adds exactly its amount into that period's
  `Contribution` column and into the closing balance; a negative lump-sum
  (withdrawal) correctly lowers the final closing balance versus a control
  run with no contribution.
- A SIP contribution permanently raises `monthlySip` in every row from its
  date forward, by exactly the delta amount; SIP is floored at 0 (never
  negative) even with a large decrease.
- `calcGoal.projectedCorpus` exactly matches `buildProjection(goal)`'s last
  row `closingBal`, and the last row's `targetValue` exactly matches
  `futureValue` — both hold even with contributions and mapped assets active.
- Cross-goal availability (§6): with Goal A mapping ₹20L of "Stocks / Shares"
  out of a ₹72.88L holding, Goal B's Map Asset panel correctly shows ₹52.88L
  available and lists "Vacation (₹20.00 L)" as already using the rest —
  verified both via a live browser screenshot of the real UI and via an
  isolated re-run of the exact `usageByLabel` reduce/filter logic.

---

## 9. Growth Projection Chart — three lines instead of two + an "actual" overlay

### Change — `src/components/GoalDetail.jsx`
Previously: **Closing Balance** (projected corpus) + **Total Invested**
(principal) + an optional dotted **Actual** overlay line sourced from the old
snapshot log (removed in §8). Now, three lines, all sourced straight from
`buildProjection` rows (no separate data-fetching path):
- **Target Value** (new) — `row.targetValue`, the inflation-adjusted goal
  cost *as of that period's end date* — a dashed amber line, so you can see
  the goal's cost rising to meet (or outrun) the corpus.
- **Current Value** (renamed from "Closing Balance") — `row.closingBal`,
  the projected corpus including every logged contribution and mapped asset.
- **Invested Value** (renamed from "Total Invested") — `row.totalInvested`,
  cumulative principal put in (SIP + lump sums, net of withdrawals).

The legend and tooltip were updated to match the new labels/colors
(Target Value: dashed `#f59e0b` amber, no fill; Current Value: solid blue/
indigo area, same gradient as before; Invested Value: solid slate area, same
gradient as before).

---

## 10. Goal form modal: sticky header/footer (long forms were losing their buttons)

### The bug
The shared `Modal` component (`src/components/Modals.jsx`, used by
`ClientFormModal`, `GoalFormModal`, `ExcelImportModal`) scrolled the **entire**
modal — including the title bar and the Cancel/Save footer — as one block.
"Configure New Goal" has ~12 fields plus a preview strip, so on anything
shorter than a very tall viewport (or at reduced browser zoom, e.g. 80%) you'd
scroll straight past the title and the Save button, landing on a screenful of
bare inputs with no way to tell what modal you were in or how to submit it.

### The fix
Rebuilt `Modal` to match the pinned-header/scrollable-body/pinned-footer
pattern already used successfully in `AssetAllocationModal.jsx`:
```jsx
function Modal({ title, onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 ... flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className={`... w-full ${maxWidth} ... flex flex-col max-h-[92vh]`} onClick={(e) => e.stopPropagation()}>
        <div className="... p-5 border-b ... shrink-0">{/* title + close */}</div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="... border-t ... shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
```
Key changes: the modal card is capped at `max-h-[92vh]` and laid out as
`flex flex-col`; the header and footer get `shrink-0` so they never compress;
only the middle body `div` scrolls (`overflow-y-auto`) — the outer backdrop no
longer scrolls at all. Verified in a browser at a cramped viewport (760px
tall, forcing scroll): scrolling the body leaves "Configure New Goal" + the
close X pinned at top and "Cancel / Configure Goal" pinned at bottom the
entire time. This is a one-function fix that improves all three modals using
the shared component, not just the goal form.

---

## 11. Year-by-year projection table: an ⓘ per row explaining Create Log jumps

### Intent
A period's numbers can now move because of a logged contribution (§8), but
there was no way to tell *why* a given row jumped just by looking at the
table — you'd have to cross-reference the Create Log list by date yourself.
Added a **blue info icon** directly on the row(s) a contribution landed in,
so hovering explains exactly what changed, right where the number changed.

### Files changed — `src/utils/calc.js`
- `contributionEvents(goal)` now also returns `entries`: the parsed, valid
  contribution list (each tagged with `absMonth`), not just the aggregated
  lump-sum-by-month / SIP-delta structures used for the maths.
- `simulate(goal, { buildRows: true })` filters `entries` down to
  `contributionsInRow = entries.filter(e => e.absMonth >= sAbs && e.absMonth < eAbs)`
  for each row and attaches it — so `buildProjection(goal)` rows now carry
  exactly which log entries (if any) fall inside that 12-month window.

### Files changed — `src/components/GoalDetail.jsx`
- New helper `contribRowHint(entries)` formats each entry into one line —
  `"SIP +₹10,000/mo from 15 Aug 2027"` or `"Lumpsum −₹50,000 on 3 Jan 2028"` —
  newline-joined so the native `title` tooltip shows one line per entry when a
  period contains more than one.
- The **Period** cell now renders a second, blue `Info` icon (distinct from
  the existing gray "partial period" icon — both can appear together) whenever
  `r.contributionsInRow.length > 0`, with `title={contribRowHint(r.contributionsInRow)}`.
- The row itself gets a subtle `bg-blue-50/40 dark:bg-blue-950/10` tint when
  it contains a contribution, so affected periods are scannable at a glance
  without needing to hover every row.

### Verified
Direct calc-engine test: a SIP contribution logged on 15 Aug 2027 (goal
created Jun 2025) attaches to exactly the "Jun 2027 – Jun 2028" row's
`contributionsInRow`, no other row. Live browser test (in a temporary
localStorage-only session, to avoid the pending Supabase migration from §8):
logged a SIP +₹8,000/mo entry dated 10 Mar 2028 via the real Create Log form
→ the "Jul 2027 – Jul 2028" row picked up the blue info icon and tinted
background, and hovering it showed exactly `"SIP +₹8,000/mo from 10 Mar 2028"`.

Separately (before this feature shipped), also directly verified the
underlying claim the whole feature rests on: **a SIP change logged in a given
year only affects that year forward, never retroactively** — ran
`buildProjection` on the same goal with and without a `+₹1,000/mo` SIP entry
dated mid-2029; rows for 2025–2028 were byte-for-byte identical between the
two runs, 2029 onward diverged and the gap widened every year after (the
step-up compounds on top of the new base), and `calcGoal.achievementPct`
moved accordingly (37.68% → 38.75%).

---

## 12. Underline the exact cell a contribution changed, icon moved into Contribution

### Refinement on §11
Feedback: the single info icon next to the **Period** label told you *a*
contribution happened in that row, but not *which number* it actually moved —
you had to already know the SIP/Contribution math to spot the effect. Fixed
by marking the changed values directly:

- **`src/components/GoalDetail.jsx`** — two new predicates:
  ```js
  const hasContrib = (r) => !!(r.contributionsInRow && r.contributionsInRow.length > 0);
  const hasSipChange = (r) => !!(r.contributionsInRow && r.contributionsInRow.some(e => e.type === 'sip'));
  ```
- **Monthly SIP** cell: underlined (`underline decoration-blue-500 decoration-2
  underline-offset-4`, bold blue text) whenever `hasSipChange(r)` — i.e. only
  when a SIP-type entry landed in that period (a lump-sum alone doesn't move
  the SIP figure, so it isn't underlined for that).
- **Contribution** cell: underlined the same way whenever `hasContrib(r)` —
  i.e. for *either* entry type, since both a lump-sum and a SIP change alter
  that period's total contribution. The blue ⓘ info icon **moved here** (off
  the Period cell, which now only carries the unrelated gray "partial period"
  icon) — hovering it still shows `contribRowHint(r.contributionsInRow)`
  (one line per entry, e.g. `"SIP +₹1,000/mo from 1 Apr 2029"`).
- The row-level blue background tint from §11 is unchanged — it's still a
  quick at-a-glance "something happened in this row" signal, while the
  underline+icon on the specific cell now says exactly *what*.

### Verified
Live browser test (temporary localStorage-only session again): logged a SIP
+₹1,000/mo entry dated 1 Apr 2029 → the "Jul 2028 – Jul 2029" row showed
**both** the Monthly SIP (₹17,496) and Contribution (₹2.13 L) values
underlined in blue, with the ⓘ icon sitting directly next to the Contribution
figure; hovering it showed `"SIP +₹1,000/mo from 1 Apr 2029"`. Confirmed via
page-source inspection that the underline class and the icon's `no-underline`
marker (so the icon itself doesn't inherit the text underline) were both
present exactly once, on the correct row.

---

## 13. Projection periods start the month AFTER creation

### Intent
A goal created in **May 2026** was labelled `May 2026 – May 2027` (an
exclusive-end window). The desired reading is inclusive and starts the month
after creation — money starts going in the month *after* you set the goal up:
```
Jun 2026 – May 2027
Jun 2027 – May 2028
Jun 2028 – May 2029  …
```

### Change — `src/utils/calc.js` → `simulate`
- `baseAbs` (the creation month) is unchanged, but a new
  `firstAbs = baseAbs + 1` is the **first contribution month**. All period
  windows are now measured from `firstAbs`, so period *k* covers absolute
  months `[firstAbs + k*12, firstAbs + k*12 + 11]`.
- The row label switched from exclusive-end to **inclusive-end**:
  `lastAbs = eAbs - 1`, label = `monthLabel(sAbs) – monthLabel(lastAbs)`.
  `chartName` likewise uses the inclusive last month.
- `targetValue` now uses `periodEnd` months elapsed from creation
  (`amount * (1+monthlyInfl)^periodEnd`) rather than a `eAbs - baseAbs` span,
  so the final row's `targetValue` still lands exactly on `futureValue`.
- Month count, compounding count and therefore `projectedCorpus` are
  unchanged — this is a *shift and relabel*, not a change to the maths.

---

## 14. Create Log: "Lumpsum" replaced by "Portfolio Valuation"

### Intent
Rather than logging a one-time contribution that compounds from mid-period,
advisors wanted to record **a portfolio valuation on a date**, whose amount is
added to the **closing balance** of the period that date falls in (and then
compounds from the next period onward).

### Changes — `src/utils/calc.js`
- `contributionEvents` no longer builds a `lumpsumByMonth` map. Entry types
  are now `'sip'` and `'valuation'`; **any non-`'sip'` type is read as a
  valuation**, which means legacy `'lumpsum'` rows still count rather than
  being silently dropped (verified by test).
- Entries are grouped into `entriesByPeriod` once, up front, with clamping:
  anything dated **before** the first contribution month falls into period 0,
  anything past the target falls into the final period — so no entry can be
  silently ignored (this matters now that periods start a month after
  creation, e.g. a valuation dated in the creation month itself).
- Inside the period loop, after the 12 monthly steps:
  ```js
  const valuationInRow = rowEntries.reduce((s, e) => s + (e.type === 'valuation' ? e.amount : 0), 0);
  if (valuationInRow) bal += valuationInRow;
  ```
  i.e. it lands **on the closing balance**, with no in-period compounding.
- `growth` now subtracts the valuation too, so each row satisfies
  `closing = opening + contribution + growth + valuation` exactly (asserted in
  testing). `valuationInRow` is exposed on the row for the UI.
- `monthlySip` now reports the **post-change** rate when a SIP entry lands
  mid-period (`lastSipInRow`), instead of the period's opening rate — the UI
  underlines that cell as "changed", so it must show the new value. Rows
  without a SIP change still report the opening rate (identical either way).

### Changes — `src/components/GoalDetail.jsx`
- `CONTRIB_TYPES` is now `Portfolio Valuation` / `SIP`; the ⓘ panel, the form
  field label ("Valuation Amount (₹)"), the ledger's type badge, the edit-history
  text and the intro copy all follow.
- `contribRowHint(entries, only)` gained a type filter so each cell's tooltip
  shows only the entries relevant to it. Valuation wording is
  `"Portfolio valuation of +₹2,00,000 added on 26 May 2027"`.
- The underline/ⓘ now tracks **where the number actually lands**:
  - `hasSipChange(r)` → underlines **Monthly SIP** + **Contribution**, ⓘ on Contribution.
  - `hasValuation(r)` → underlines **Closing Bal**, ⓘ on Closing Bal.
  Both use the same fixed-width (`w-[13px]`) icon slot from §12 so column
  alignment is unaffected whether or not an icon is present.

---

## 15. Growth chart now opens at the goal's creation month

### Change — `src/components/GoalDetail.jsx`
The chart's first x-axis tick was the *end* of period 0, so the year the goal
was actually created never appeared. `chartData` now prepends an origin point
at the creation month:
```js
{
  name: `${MONTH_NAMES[createdM - 1]} '${String(createdY).slice(2)}`,
  'Target Value': Math.round(Number(goal.amount) || 0),  // un-inflated cost at creation
  'Current Value': Math.round(c.startCorpus),
  'Invested Value': Math.round(c.startCorpus),
}
```
(`MONTH_NAMES`, `CURRENT_MONTH`, `CURRENT_YEAR` added to the `calc` import.)
So a goal created May 2026 now plots `May '26 → May '27 → … → May '36`.

### Verified (§13–15, live browser, localStorage-only session)
Seeded a goal created **14 May 2026** (target May 2036) and logged a
**Portfolio Valuation of +₹2,00,000 on 26 May 2027**:
- Period labels rendered `Jun 2026 – May 2027`, `Jun 2027 – May 2028`, … ✓
- The valuation landed on the **Jun 2026 – May 2027** row, whose Closing Bal
  (₹3.28 L) was underlined blue with the ⓘ beside it reading exactly
  *"Portfolio valuation of +₹2,00,000 added on 26 May 2027"* ✓
- The word "Lumpsum" no longer appears anywhere in the UI ✓
- Chart x-axis starts at `May '26` ✓, all three area series render ✓
Calc-engine tests additionally confirmed: the period-0 closing balance rises by
*exactly* the valuation amount (no in-period compounding); every row satisfies
`closing = opening + contribution + growth + valuation`;
`calcGoal.projectedCorpus` still equals the last row's closing balance; legacy
`lumpsum`-typed entries are still honoured; and a mid-period SIP change now
displays the post-change rate on the row it lands in.

---

## 16. Three calculation bugs: SIP step-up, valuation double-counting, additionalSip

Follow-up report after §13–15 shipped, testing the feature for real:
1. "if i added portfolio valuation then compounding is not happening" — traced
   to §16.2 below (multiple valuations were being summed, producing numbers
   that didn't look like clean compounding).
2. "sip is not stepping up like if i added sip its not stepping up" — a real
   bug: the annual step-up only ever compounded the *original* base SIP; a
   manually logged SIP increase sat on top as a flat, permanently-frozen
   add-on that never itself grew.
3. "if i added new portfolio valuation... avoid the previous one" — multiple
   valuation entries were being **summed**, which double/triple-counts the
   same portfolio (each valuation is a snapshot of the *same* money, not a
   separate cash injection) — only the most recent one should count.
4. "check if additional sip is updating accordingly to all this" — verification
   pass on `calcGoal.additionalSip`/`sipRequired` against all of the above.

### Fix 1 — SIP step-up now compounds the *current* value, not just the base
**`src/utils/calc.js` → `simulate`.** Previously: `baseSip = startSip *
(1+incRate)^k`, with a separately-tracked `cumSipDelta` added flat on top
forever — so a manual SIP change never itself received a future step-up.
Replaced with a single running value:
```js
let currentSip = startSip;
for (let k = 0; k < numPeriods; k++) {
  if (k > 0) currentSip = currentSip * (1 + incRate); // step-up applies to whatever it currently is
  for (let i = 0; i < monthsInRow; i++) {
    while (sipPtr < sipDeltas.length && sipDeltas[sipPtr].absMonth <= mAbs) {
      currentSip = Math.max(0, currentSip + sipDeltas[sipPtr].delta);
      sipPtr++;
    }
    const sip = currentSip;
    …
  }
}
```
Now a logged SIP change becomes the new baseline, and the *next* anniversary's
step-up compounds the whole thing (base + manual change) together — e.g. SIP
10,000 → step-ups to 12,100 → +5,000 logged mid-period → 17,100 → **next**
step-up is `17,100 × 1.1 = 18,810`, not the old buggy `13,310 + 5,000 =
18,310`. Verified directly against this exact scenario.

### Fix 2 — only the latest portfolio valuation counts (older ones voided)
**`src/utils/calc.js`** — new exported helper:
```js
export function activeValuationId(contributions) {
  let latest = null;
  (Array.isArray(contributions) ? contributions : []).forEach(c => {
    if (c.type === 'sip') return;
    if (!Number(c.amount)) return;
    const d = new Date(c.date);
    if (isNaN(d.getTime())) return;
    if (!latest || d > new Date(latest.date)) latest = c;
  });
  return latest ? latest.id : null;
}
```
`contributionEvents` now calls this once and **drops every valuation entry
except the active one** before building `entries`/`sipDeltas` — so a
superseded valuation never reaches the simulation, `entriesByPeriod`,
`contributionsInRow`, or `valuationInRow` at all; it's as if it were never
logged, for calculation purposes. SIP entries are unaffected — every SIP entry
still stacks/compounds, since each is a real, separate change over time
(unlike valuations, which are repeated snapshots of the *same* thing).

This is a **single source of truth** used by both the simulation and the UI —
see below — so the "which one is active" logic can never drift between the
two.

### Fix 3 — Create Log ledger shows superseded valuations
**`src/components/GoalDetail.jsx`** — `activeValuationId` imported from
`calc.js` and called once per render:
```js
const activeValId = activeValuationId(contributions);
```
Any valuation entry whose `id !== activeValId` renders at 50% row opacity with
a gray **"Superseded"** pill next to its type badge (title: *"A newer
portfolio valuation exists — this one no longer affects the calculation"*).
The entry is **not deleted** — it stays in `goal.contributions` and visible in
the ledger for audit purposes; it's excluded purely from the math. SIP entries
are never marked superseded. The ⓘ info-panel copy for both entry types was
updated to describe this behaviour up front (valuation: *"Only the most
recent valuation counts — logging a new one supersedes any earlier ones"*;
SIP: *"Every future annual step-up applies to the new, updated SIP amount"*).

### Fix 4 — verified `additionalSip` end-to-end
Since `calcGoal.sipRequired`/`additionalSip` both route through the same
`simulate()` used above, no separate fix was needed there — but it was
explicitly re-verified rather than assumed:
- Logging a large valuation → `additionalSip` drops (verified: went negative,
  i.e. now over-funded, on a ₹20L valuation against a goal that previously
  needed ₹16,536/mo more).
- Logging a SIP increase → `additionalSip` drops accordingly.
- Logging **two** valuations → `additionalSip` is byte-for-byte identical to
  a run with **only the latest** valuation present, proving the superseded
  one truly contributes nothing (not even partially).

### Verified (calc-engine tests + live browser, localStorage-only session)
7 targeted tests, all passing: (A) SIP step-up compounds inclusive of a
manual change; (B) a single valuation's effect vs. no-valuation grows every
year (real compounding); (C) with two valuations logged, the closing-balance
diff at the landing period is *exactly* the latest valuation's amount (not
the sum of both), and continues compounding cleanly afterward; (D)/(E)
`additionalSip` responds correctly to a valuation and to a SIP change
respectively; (F) `additionalSip` with two valuations logged matches a
control run with only the latest present; (G) `calcGoal.projectedCorpus`
still equals the last projection row's `closingBal` across every scenario
above. Live browser test: logged valuation #1 (₹2,00,000, 26 May 2027), then
valuation #2 (₹1,50,000, 26 May 2029), then a SIP +₹5,000 (1 Jul 2028) — the
ledger showed #1 faded with a "Superseded" badge, #2 active; the "Jun 2028 –
May 2029" table row correctly showed **both** the SIP-driven Monthly
SIP/Contribution underline (₹17,100 = 12,100 stepped-up base + 5,000) and the
valuation-driven Closing Bal underline simultaneously, with no console errors.

### Follow-up fix — this introduced a column-alignment bug
Two things in §12 broke the numeric columns' right-alignment:
1. `font-bold` on the underlined cells made those numerals **visibly wider**
   than the regular-weight numbers in every other row of the same column
   (bold glyphs are wider even with `tabular-nums`, which only guarantees
   equal digit width *within* one font weight, not across weights) — so the
   affected row's numbers looked shifted left relative to the rest of the
   column, even though the CSS right-edge was technically still correct.
2. In the **Contribution** column specifically, the ⓘ icon was appended
   *inside* the same `inline-flex justify-end` span as the number. `justify-
   end` right-aligns the whole [number + icon] group, so on rows with the
   icon, the icon (not the number) touched the cell's right edge and the
   number itself sat ~19px further left than on rows without an icon — a
   real, measurable misalignment, not just a visual illusion.

Fixed both in `src/components/GoalDetail.jsx`:
- Dropped `font-bold` from the underline styling on both the Monthly SIP and
  Contribution cells — they're still colored blue and underlined to signal
  "this changed," just at the same font weight as every other row, so
  `tabular-nums` keeps every row's numeral width identical.
- Contribution cell restructured so the icon lives in its own **fixed-width
  reserved slot** (`w-[13px] shrink-0`) that's rendered on *every* row
  (empty when there's no contribution, holding the icon when there is) —
  the number's own span is right-aligned independently of whether that slot
  is occupied, so its right edge never moves.

**Verified with real pixel measurements**, not just a visual check: queried
the bounding box of every row's Monthly SIP and Contribution `<td>` in a live
browser render (12 rows, one with a logged SIP entry) — right edges came
back **identical to the pixel** across all 12 rows in both columns (747px and
933px respectively, in that test's layout), including the row with the icon.
