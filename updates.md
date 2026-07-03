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
