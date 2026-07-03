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

// Future value of a monthly SIP stream that runs for `totalMonths`, stepping up
// on each 12-month anniversary of the goal's start (NOT on the calendar new year).
// e.g. a goal started 12 Jun 2026 keeps SIP flat Jun 2026→May 2027, steps up in
// Jun 2027, steps up again Jun 2028, and so on.
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

// Re-base the plan to the most recent logged actual ("Create Log") value.
// From that date onward the corpus starts at the actual amount and the remaining
// SIP/projection are recomputed — so logged values actually move the numbers, not
// just the chart. Inflation of the goal cost stays anchored to the creation date.
// Returns the effective start month/year and starting corpus.
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
    // Only re-base for a logged value at/after the goal's creation
    if (monthsBetween(createdM, createdY, am, ay) >= 0) {
      return { anchorM: am, anchorY: ay, anchorInv: Number(latest.amount) || 0, rebased: true };
    }
  }
  return { anchorM: createdM, anchorY: createdY, anchorInv: Number(goal.currentInv) || 0, rebased: false };
}

export function calcGoal(goal) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear || CURRENT_YEAR;
  // Full horizon (creation → target) inflates the goal cost; remaining horizon
  // (anchor → target) grows the corpus & SIP so logged actuals re-base the plan.
  const inflationMonths = Math.max(0, monthsBetween(createdM, createdY, tgtM, tgtY));
  const { anchorM, anchorY, anchorInv, rebased } = goalAnchor(goal);
  const months = Math.max(0, monthsBetween(anchorM, anchorY, tgtM, tgtY));
  const years = months / 12;
  const amount = Number(goal.amount) || 0;
  const inflation = (Number(goal.inflation) || 0) / 100;
  const r = (Number(goal.expectedReturn) || 0) / 100;
  const incRate = (Number(goal.sipIncRate) || 0) / 100;
  const currentInv = anchorInv;
  const currentSip = Number(goal.currentSip) || 0;
  const monthlyR = r / 12;
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;

  const futureValue = amount * Math.pow(1 + monthlyInfl, inflationMonths);
  const fvOfCurrentInv = currentInv * Math.pow(1 + monthlyR, months);
  const fvOfCurrentSip = fvOfSipStream(currentSip, months, monthlyR, incRate);

  const projectedCorpus = fvOfCurrentInv + fvOfCurrentSip;
  const shortfall = Math.max(0, futureValue - projectedCorpus);
  const achievementPct = futureValue > 0 ? Math.min(100, (projectedCorpus / futureValue) * 100) : 100;

  let sipRequired = 0;
  if (months > 0) {
    const sipTargetFV = Math.max(0, futureValue - fvOfCurrentInv);
    if (sipTargetFV > 0) {
      let lo = 0;
      let hi = Math.max(sipTargetFV, 1);
      while (fvOfSipStream(hi, months, monthlyR, incRate) < sipTargetFV) {
        hi *= 2;
        if (hi > 1e15) break;
      }
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        const fv = fvOfSipStream(mid, months, monthlyR, incRate);
        if (fv < sipTargetFV) lo = mid; else hi = mid;
      }
      sipRequired = (lo + hi) / 2;
    }
  }

  const lumpSumRequired = months > 0
    ? Math.max(0, futureValue / Math.pow(1 + monthlyR, months) - currentInv)
    : Math.max(0, futureValue - currentInv);

  // Signed difference: positive => more SIP needed, negative => over-funded (extra SIP mapped)
  const additionalSip = sipRequired - currentSip;
  const sipOnTrack = currentSip >= sipRequired - 0.5;

  return { months, years, futureValue, projectedCorpus, shortfall, achievementPct, sipRequired, additionalSip, sipOnTrack, lumpSumRequired, fvOfCurrentInv, fvOfCurrentSip, rebased, anchorInv, anchorMonth: anchorM, anchorYear: anchorY };
}

// Year-by-year projection where each row is a 12-month window anchored to the
// goal's start (anniversary) month — e.g. a goal started Jun 2026 yields rows
// Jun 2026→Jun 2027, Jun 2027→Jun 2028, … The final row may be a partial period
// if the target date isn't a whole number of years away. SIP steps up on each
// anniversary, staying consistent with fvOfSipStream / calcGoal.
export function buildProjection(goal, sipOverride) {
  // Anchor to the latest logged actual (if any) so the projection reflects reality.
  const { anchorM: startM, anchorY: startY, anchorInv } = goalAnchor(goal);
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear;
  const totalMonths = Math.max(0, monthsBetween(startM, startY, tgtM, tgtY));
  const monthlyR = (goal.expectedReturn / 100) / 12;
  const incRate = goal.sipIncRate / 100;
  const rows = [];

  if (totalMonths === 0) return rows;

  const baseAbs = startY * 12 + (startM - 1); // absolute month index of the start
  const startBal = anchorInv;
  const startSip = sipOverride !== undefined ? sipOverride : (Number(goal.currentSip) || 0);
  let bal = startBal;
  let invested = startBal;

  const numPeriods = Math.ceil(totalMonths / 12);
  for (let k = 0; k < numPeriods; k++) {
    const sip = startSip * Math.pow(1 + incRate, k); // stepped up on each anniversary
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

    const sAbs = baseAbs + periodStart;
    const eAbs = baseAbs + periodEnd;
    const startMonth = (sAbs % 12) + 1, startYr = Math.floor(sAbs / 12);
    const endMonth = (eAbs % 12) + 1, endYr = Math.floor(eAbs / 12);

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
      monthlySip: sip,
      yearContribution: rowContribution,
      growth: bal - openingBal - rowContribution,
      closingBal: bal,
      totalInvested: invested,
    });
  }
  return rows;
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
  sections.forEach((s, i) => {
    lines.push(`${s.label}:`);
    client.goals.forEach(g => {
      lines.push(`  • ${g.name}: ${g[s.key]}%`);
    });
    if (i < sections.length - 1) lines.push('');
  });
  return lines.join('\n');
}

export function generateAssumptionsText(client) {
  return buildAssumptionsBlock(client);
}

export function refreshAssumptionsText(client, currentText) {
  const freshBlock = buildAssumptionsBlock(client);

  const lines = currentText.split('\n');
  const headerRegex = /^(Inflation rate|Expected return|SIP step-up rate):\s*$/;
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
