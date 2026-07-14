import {
  Shield, Plane, Car, Home, Heart, GraduationCap, Gift, Sparkles, Wallet, MoreHorizontal
} from 'lucide-react';

export const NOW = new Date();
export const CURRENT_YEAR = NOW.getFullYear();
export const CURRENT_MONTH = NOW.getMonth() + 1;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthLabel = (m, y) => `${MONTH_NAMES[(m - 1 + 12) % 12]} ${y}`;
export const monthsBetween = (fromM, fromY, toM, toY) => (toY - fromY) * 12 + (toM - fromM);

export const GOAL_PRESETS = ['Emergency', 'Vacation', 'Dream Car', 'Dream Home', 'Marriage', 'Kids Education', 'Kids Marriage', 'Financial Freedom', 'Wealth Creation', 'Others'];

// Goals that are tied to a specific child and therefore capture the kid's name
export const KID_GOALS = ['Kids Education', 'Kids Marriage'];
export const needsKidName = (name) => KID_GOALS.includes(name);

// Format a full ISO timestamp as a readable date, e.g. "15 Jun 2026"
export const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

// Date the goal was created — falls back to the planning anchor month/year for legacy goals
export const goalCreatedLabel = (goal) =>
  fmtDate(goal.createdAt) || monthLabel(goal.createdMonth || CURRENT_MONTH, goal.createdYear || CURRENT_YEAR);

export const GOAL_EMOJIS = {
  'Emergency': '➕',
  'Vacation': '✈️',
  'Dream Car': '🚗',
  'Dream Home': '🏠',
  'Marriage': '💍',
  'Kids Education': '🎓',
  'Kids Marriage': '🎁',
  'Financial Freedom': '🪑',
  'Wealth Creation': '💼',
  'Others': '🎯',
};

const GOAL_ICONS = {
  'Emergency': Shield,
  'Vacation': Plane,
  'Dream Car': Car,
  'Dream Home': Home,
  'Marriage': Heart,
  'Kids Education': GraduationCap,
  'Kids Marriage': Gift,
  'Financial Freedom': Sparkles,
  'Wealth Creation': Wallet,
};

export const goalIcon = (name) => GOAL_ICONS[name] || MoreHorizontal;
export const goalEmoji = (name) => GOAL_EMOJIS[name] || '🎯';

export const fmtINR = (n) => {
  if (!isFinite(n) || n === null || n === undefined) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const fmtFull = (n) => {
  if (!isFinite(n) || n === null) return '₹0';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const fmtSip = (n) => {
  if (!isFinite(n) || n === null || n === undefined) return '₹0';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
};

export const achievementColor = (pct) => {
  if (pct >= 99.95) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  if (pct >= 30) return 'bg-orange-500';
  return 'bg-red-500';
};

export const achievementBadge = (pct) => {
  if (pct >= 99.95) return 'bg-green-50 text-green-700 ring-1 ring-green-200/50 dark:bg-green-950/20 dark:text-green-400 dark:ring-green-900/30';
  if (pct >= 60) return 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200/50 dark:bg-yellow-950/20 dark:text-yellow-400 dark:ring-yellow-900/30';
  if (pct >= 30) return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/50 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-900/30';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:ring-red-900/30';
};

// Compare a goal before/after an edit and return a list of human-readable changes.
// Each change => { label, from, to }. Used to build the goal's edit history log.
export function buildGoalEdits(prev, next) {
  const edits = [];
  const numChanged = (a, b) => (Number(a) || 0) !== (Number(b) || 0);
  const dash = (v) => (v === undefined || v === null || v === '') ? '—' : v;
  const push = (label, from, to) => edits.push({ label, from, to });

  if ((prev.name || '') !== (next.name || '')) push('Goal name', dash(prev.name), dash(next.name));
  if (numChanged(prev.createdMonth, next.createdMonth) || numChanged(prev.createdYear, next.createdYear)) {
    push('Goal created date', monthLabel(prev.createdMonth || 1, prev.createdYear), monthLabel(next.createdMonth || 1, next.createdYear));
  }
  if ((prev.kidName || '') !== (next.kidName || '')) push("Kid's name", dash(prev.kidName), dash(next.kidName));
  if (numChanged(prev.amount, next.amount)) push('Goal cost (today)', fmtFull(prev.amount), fmtFull(next.amount));
  if (numChanged(prev.targetMonth, next.targetMonth) || numChanged(prev.targetYear, next.targetYear)) {
    push('Target date', monthLabel(prev.targetMonth || 1, prev.targetYear), monthLabel(next.targetMonth || 1, next.targetYear));
  }
  if (numChanged(prev.inflation, next.inflation)) push('Inflation rate', `${prev.inflation}%`, `${next.inflation}%`);
  if (numChanged(prev.expectedReturn, next.expectedReturn)) push('Expected return', `${prev.expectedReturn}%`, `${next.expectedReturn}%`);
  if (numChanged(prev.sipIncRate, next.sipIncRate)) push('SIP step-up', `${prev.sipIncRate}%`, `${next.sipIncRate}%`);
  if (numChanged(prev.currentInv, next.currentInv)) push('Current corpus', fmtFull(prev.currentInv), fmtFull(next.currentInv));
  if (numChanged(prev.currentSip, next.currentSip)) push('Current SIP', fmtFull(prev.currentSip), fmtFull(next.currentSip));
  const mappedTotal = (g) => (Array.isArray(g.mappedAssets) ? g.mappedAssets : []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  if (numChanged(mappedTotal(prev), mappedTotal(next))) push('Mapped assets total', fmtFull(mappedTotal(prev)), fmtFull(mappedTotal(next)));
  return edits;
}

export const nv = (v) => (v === undefined || v === null || Number.isNaN(v)) ? '' : v;

export const parseNum = (e, min) => {
  const raw = e.target.value;
  if (raw === '' || raw === '-') return undefined;
  const n = Number(raw);
  if (!isFinite(n)) return undefined;
  return min !== undefined ? Math.max(min, n) : n;
};

const AVATAR_PALETTE = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
];

export const avatarColor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

export const initials = (name) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

// Starting corpus for the simulation = the manually-typed "Existing
// Accumulated Corpus" plus any client asset holdings mapped to this goal
// (Map Asset, see Modals.jsx). Mapped assets are stored on the goal
// separately (goal.mappedAssets) rather than folded into currentInv, so the
// per-asset breakdown survives for the "available elsewhere" checks in the
// goal form and for the Planning Assumptions display.
export function goalStartingCorpus(goal) {
  const base = Number(goal.currentInv) || 0;
  const mapped = Array.isArray(goal.mappedAssets)
    ? goal.mappedAssets.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    : 0;
  return base + mapped;
}

// Parse a goal's "Create Log" contribution entries into simulation-ready
// shape: a Map of absolute-month -> summed lump-sum amount (signed; negative
// = withdrawal), and a date-sorted list of SIP deltas (signed; negative =
// a decrease to the running monthly SIP from that month forward).
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
    if (c.type === 'lumpsum') {
      lumpsumByMonth.set(absMonth, (lumpsumByMonth.get(absMonth) || 0) + amt);
    } else if (c.type === 'sip') {
      sipDeltas.push({ absMonth, delta: amt });
    }
  });
  sipDeltas.sort((a, b) => a.absMonth - b.absMonth);
  return { lumpsumByMonth, sipDeltas };
}

// Single source of truth for the goal's growth simulation — used by both
// calcGoal (projected corpus / SIP search, row-building skipped for speed)
// and buildProjection (the year-by-year table, row-building on). The grid
// always starts at the goal's CREATION month and steps the base SIP up on
// each creation anniversary. Logged "Create Log" contributions are layered
// on top month-by-month as they occur: a lump-sum event adds/removes its
// amount from the balance the month it was logged; a SIP event permanently
// shifts the running monthly SIP (up or down) from that month forward.
function simulate(goal, { sipOverride, buildRows = false } = {}) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear || CURRENT_YEAR;
  const totalMonths = Math.max(0, monthsBetween(createdM, createdY, tgtM, tgtY));
  const startCorpus = goalStartingCorpus(goal);
  if (totalMonths === 0) return { rows: [], closingBal: startCorpus };

  const monthlyR = (Number(goal.expectedReturn) || 0) / 100 / 12;
  const incRate = (Number(goal.sipIncRate) || 0) / 100;
  const inflation = (Number(goal.inflation) || 0) / 100;
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;
  const amount = Number(goal.amount) || 0;
  const baseAbs = createdY * 12 + (createdM - 1);
  const startSip = sipOverride !== undefined ? sipOverride : (Number(goal.currentSip) || 0);
  const { lumpsumByMonth, sipDeltas } = contributionEvents(goal);

  let bal = startCorpus;
  let invested = startCorpus;
  let sipPtr = 0;
  let cumSipDelta = 0;
  const rows = buildRows ? [] : null;

  const numPeriods = Math.ceil(totalMonths / 12);
  for (let k = 0; k < numPeriods; k++) {
    const baseSip = startSip * Math.pow(1 + incRate, k); // stepped up on each creation anniversary
    const periodStart = k * 12;
    const periodEnd = Math.min((k + 1) * 12, totalMonths);
    const monthsInRow = periodEnd - periodStart;

    const openingBal = bal;
    let rowContribution = 0;
    let firstSipInRow = null;
    for (let i = 0; i < monthsInRow; i++) {
      const mAbs = baseAbs + periodStart + i;
      while (sipPtr < sipDeltas.length && sipDeltas[sipPtr].absMonth <= mAbs) {
        cumSipDelta += sipDeltas[sipPtr].delta;
        sipPtr++;
      }
      const sip = Math.max(0, baseSip + cumSipDelta);
      if (firstSipInRow === null) firstSipInRow = sip;
      const lump = lumpsumByMonth.get(mAbs) || 0;
      if (lump) { bal += lump; invested += lump; rowContribution += lump; }
      bal = (bal + sip) * (1 + monthlyR);
      rowContribution += sip;
      invested += sip;
    }

    if (buildRows) {
      const sAbs = baseAbs + periodStart;
      const eAbs = baseAbs + periodEnd;
      const startMonth = (sAbs % 12) + 1, startYr = Math.floor(sAbs / 12);
      const endMonth = (eAbs % 12) + 1, endYr = Math.floor(eAbs / 12);
      const targetValue = amount * Math.pow(1 + monthlyInfl, eAbs - baseAbs);
      rows.push({
        periodIndex: k,
        startMonth, startYear: startYr,
        endMonth, endYear: endYr,
        startAbs: sAbs, endAbs: eAbs,
        label: `${monthLabel(startMonth, startYr)} – ${monthLabel(endMonth, endYr)}`,
        chartName: `${MONTH_NAMES[endMonth - 1]} '${String(endYr).slice(2)}`,
        monthsCovered: monthsInRow,
        isPartial: monthsInRow < 12,
        openingBal,
        monthlySip: firstSipInRow ?? baseSip,
        yearContribution: rowContribution,
        growth: bal - openingBal - rowContribution,
        closingBal: bal,
        totalInvested: invested,
        targetValue,
      });
    }
  }
  return { rows: rows || [], closingBal: bal };
}

export function calcGoal(goal) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear || CURRENT_YEAR;
  const months = Math.max(0, monthsBetween(createdM, createdY, tgtM, tgtY));
  const years = months / 12;
  const amount = Number(goal.amount) || 0;
  const inflation = (Number(goal.inflation) || 0) / 100;
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;
  const futureValue = amount * Math.pow(1 + monthlyInfl, months);

  // Projected corpus = same month-by-month simulation the projection table
  // uses, so the summary tiles and the table always agree exactly.
  const projectedCorpus = simulate(goal).closingBal;
  const shortfall = Math.max(0, futureValue - projectedCorpus);
  const achievementPct = futureValue > 0 ? Math.min(100, (projectedCorpus / futureValue) * 100) : 100;

  // sipRequired solves for the BASE monthly SIP (i.e. what "Current Monthly
  // SIP Allocation" would need to be) that hits the target, holding all
  // logged Create Log contributions (lump sums + SIP deltas) fixed.
  let sipRequired = 0;
  if (months > 0 && futureValue > 0) {
    const zeroSipClosing = simulate(goal, { sipOverride: 0 }).closingBal;
    if (futureValue > zeroSipClosing) {
      let lo = 0;
      let hi = Math.max(futureValue, 1);
      while (simulate(goal, { sipOverride: hi }).closingBal < futureValue) {
        hi *= 2;
        if (hi > 1e15) break;
      }
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (simulate(goal, { sipOverride: mid }).closingBal < futureValue) lo = mid; else hi = mid;
      }
      sipRequired = (lo + hi) / 2;
    }
  }

  // Lump-sum equivalent: how much would need to be invested as a one-time
  // top-up, on top of the starting corpus, to hit the future value on its own.
  const startCorpus = goalStartingCorpus(goal);
  const monthlyR = (Number(goal.expectedReturn) || 0) / 100 / 12;
  const lumpSumRequired = months > 0
    ? Math.max(0, futureValue / Math.pow(1 + monthlyR, months) - startCorpus)
    : Math.max(0, futureValue - startCorpus);

  // Signed difference: positive => more SIP needed, negative => over-funded
  const currentSip = Number(goal.currentSip) || 0;
  const additionalSip = sipRequired - currentSip;
  const sipOnTrack = currentSip >= sipRequired - 0.5;

  const hasContributions = Array.isArray(goal.contributions) && goal.contributions.length > 0;
  const hasMappedAssets = Array.isArray(goal.mappedAssets) && goal.mappedAssets.length > 0;

  return { months, years, futureValue, projectedCorpus, shortfall, achievementPct, sipRequired, additionalSip, sipOnTrack, lumpSumRequired, startCorpus, hasContributions, hasMappedAssets };
}

// Year-by-year projection where each row is a 12-month window anchored to the
// goal's CREATION month — e.g. a goal created 14 Jun 2025 always begins its
// table at "Jun 2025 – Jun 2026", then "Jun 2026 – Jun 2027", and so on, all
// the way to the target. The SIP steps up on each anniversary of creation.
// Logged Create Log contributions (lump sums / SIP changes) are applied at
// their exact months, so later rows reflect what actually happened — but the
// row grid itself never shifts. The final row may be partial if the target
// date isn't a whole number of years from creation.
export function buildProjection(goal, sipOverride) {
  return simulate(goal, { sipOverride, buildRows: true }).rows;
}

export function uid() { return 'id_' + Math.random().toString(36).slice(2, 9); }

export function buildAssumptionsBlock(client) {
  if (!client.goals || client.goals.length === 0) {
    return 'No goals set yet for this client. Add a goal to populate assumptions.';
  }
  const lines = [];
  const sections = [
    { label: 'Inflation rate', key: 'inflation' },
    { label: 'Expected return', key: 'expectedReturn' },
    { label: 'SIP step-up rate', key: 'sipIncRate' },
  ];
  sections.forEach((s) => {
    lines.push(`${s.label}:`);
    client.goals.forEach(g => {
      lines.push(`  • ${g.name}: ${g[s.key]}%`);
    });
    lines.push('');
  });

  // Which of the client's assets are mapped into which goal's corpus, so
  // it's visible at a glance where an asset's value is already committed.
  const goalsWithAssets = client.goals.filter(g => Array.isArray(g.mappedAssets) && g.mappedAssets.length > 0);
  lines.push('Mapped Assets:');
  if (goalsWithAssets.length === 0) {
    lines.push('  • No assets mapped to any goal yet.');
  } else {
    goalsWithAssets.forEach(g => {
      const parts = g.mappedAssets.map(a => `${a.label} (${fmtFull(a.amount)})`).join(', ');
      lines.push(`  • ${g.name}: ${parts}`);
    });
  }
  return lines.join('\n');
}

export function generateAssumptionsText(client) {
  return buildAssumptionsBlock(client);
}

export function refreshAssumptionsText(client, currentText) {
  const freshBlock = buildAssumptionsBlock(client);

  const lines = currentText.split('\n');
  const headerRegex = /^(Inflation rate|Expected return|SIP step-up rate|Mapped Assets):\s*$/;
  const bulletRegex = /^\s*•\s/;

  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i]) && i + 1 < lines.length && bulletRegex.test(lines[i + 1])) {
      blockStart = i;
      break;
    }
  }

  if (blockStart === -1) {
    const trimmedExisting = currentText.replace(/^\s+/, '');
    return trimmedExisting.length > 0
      ? `${freshBlock}\n\n${trimmedExisting}`
      : freshBlock;
  }

  let blockEnd = blockStart;
  for (let i = blockStart + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.trim() === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && (headerRegex.test(lines[j]) || bulletRegex.test(lines[j]))) {
        continue;
      } else {
        break;
      }
    }
    if (headerRegex.test(ln) || bulletRegex.test(ln)) {
      blockEnd = i;
    } else {
      break;
    }
  }

  while (blockEnd > blockStart && lines[blockEnd].trim() === '') blockEnd--;

  const before = lines.slice(0, blockStart).join('\n');
  const after = lines.slice(blockEnd + 1).join('\n');

  const beforeJoin = before.length > 0 ? (before.endsWith('\n') ? before : before + '\n') : '';
  const afterTrimmed = after.replace(/^\n+/, '');
  const afterJoin = afterTrimmed.length > 0 ? '\n\n' + afterTrimmed : '';

  return `${beforeJoin}${freshBlock}${afterJoin}`;
}
