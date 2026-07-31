import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, CheckCircle2, Upload, AlertCircle, FileSpreadsheet, Link2, Wallet, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Field, inputCls, selectCls, btnPrimary, btnGhost } from './UI';
import {
  calcGoal, monthsBetween, fmtFull, fmtINR, fmtSip, nv, parseNum, GOAL_PRESETS, CURRENT_MONTH, CURRENT_YEAR, MONTH_NAMES, needsKidName
} from '../utils/calc';
import { filledItems } from '../utils/assets';

const parseAssetAmt = (s) => {
  const n = Number(String(s ?? '').replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : 0;
};

function Modal({ title, onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl w-full ${maxWidth} shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col max-h-[92vh]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function ClientFormModal({ initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial ? initial.name : '');
  const [pan, setPan] = useState(initial ? initial.pan : '');
  const [age, setAge] = useState(initial ? initial.age : '');
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

  return (
    <Modal
      title={isEdit ? "Edit Client Profile" : "Create Client Profile"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button 
            onClick={() => name.trim() && panValid && onSave(name, pan, age)} 
            disabled={!name.trim() || !panValid} 
            className={btnPrimary}
          >
            {isEdit ? "Save Changes" : "Create Client"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Full Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Aarav Sharma" />
        </Field>
        <Field label="PAN Card Number" hint={pan && !panValid ? 'Format must be: 5 letters, 4 digits, 1 letter' : null}>
          <input
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="e.g. ABCDE1234F"
            maxLength={10}
            className={inputCls + ' font-mono tracking-widest uppercase'}
          />
        </Field>
        <Field label="Age">
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} placeholder="e.g. 35" />
        </Field>
      </div>
    </Modal>
  );
}

export function GoalFormModal({ initial, assetAllocation, clientGoals, onClose, onSave }) {
  const isEdit = !!initial;
  const initialIsPreset = initial ? GOAL_PRESETS.includes(initial.name) && initial.name !== 'Others' : true;
  const [nameChoice, setNameChoice] = useState(initial ? (initialIsPreset ? initial.name : 'Others') : '');
  const [customName, setCustomName] = useState(initial && !initialIsPreset ? initial.name : '');
  const [kidName, setKidName] = useState(initial ? (initial.kidName || '') : '');
  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    amount: initial.amount,
    targetMonth: initial.targetMonth || 1,
    targetYear: initial.targetYear,
    inflation: initial.inflation,
    expectedReturn: initial.expectedReturn,
    sipIncRate: initial.sipIncRate,
    currentInv: initial.currentInv,
    currentSip: initial.currentSip,
    createdMonth: initial.createdMonth || CURRENT_MONTH,
    createdYear: initial.createdYear || CURRENT_YEAR,
  } : {
    name: '',
    amount: undefined,
    targetMonth: CURRENT_MONTH,
    targetYear: CURRENT_YEAR + 10,
    inflation: 6,
    expectedReturn: 12,
    sipIncRate: 10,
    currentInv: undefined,
    currentSip: undefined,
    createdMonth: CURRENT_MONTH,
    createdYear: CURRENT_YEAR,
  });
  
  // Editable goal creation/anchor date — lets backdated goals (created before this app existed) compound correctly
  const [createdDate, setCreatedDate] = useState(() => {
    if (initial?.createdAt) {
      const d = new Date(initial.createdAt);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (initial) {
      const m = String(initial.createdMonth || CURRENT_MONTH).padStart(2, '0');
      return `${initial.createdYear || CURRENT_YEAR}-${m}-01`;
    }
    return new Date().toISOString().slice(0, 10);
  });

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleCreatedDateChange = (e) => {
    const v = e.target.value;
    setCreatedDate(v);
    const d = new Date(v + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      setForm(f => ({ ...f, createdMonth: d.getMonth() + 1, createdYear: d.getFullYear() }));
    }
  };
  const effectiveName = nameChoice === 'Others' ? customName.trim() : nameChoice;
  const showKidName = needsKidName(effectiveName);

  // --- Map Asset ---------------------------------------------------------
  // The client's existing asset holdings (financial + physical, excludes
  // liabilities) available to seed this goal's starting corpus. Mapped
  // amounts are stored separately from currentInv (goal.mappedAssets) — not
  // folded in — so we can show, per asset, how much is already committed to
  // this client's OTHER goals and how much is still available.
  const assetHoldings = useMemo(() => {
    if (!assetAllocation) return [];
    return ['financial', 'physical'].flatMap(sid =>
      filledItems(assetAllocation, sid).map(it => ({ ...it, sectionId: sid }))
    );
  }, [assetAllocation]);
  const hasAssets = assetHoldings.length > 0;

  // How much of each asset is already mapped to this client's OTHER goals
  // (excludes the goal currently being edited, so re-editing doesn't
  // double-subtract its own existing mapping).
  const usageByLabel = useMemo(() => {
    const map = {};
    (clientGoals || []).forEach(g => {
      if (initial && g.id === initial.id) return;
      (Array.isArray(g.mappedAssets) ? g.mappedAssets : []).forEach(a => {
        const amt = Number(a.amount) || 0;
        if (amt <= 0) return;
        if (!map[a.label]) map[a.label] = [];
        map[a.label].push({ goalName: g.name, amount: amt });
      });
    });
    return map;
  }, [clientGoals, initial]);

  const [mapOpen, setMapOpen] = useState(() => Array.isArray(initial?.mappedAssets) && initial.mappedAssets.length > 0);
  const [mapAmt, setMapAmt] = useState(() => {
    const m = {};
    (initial?.mappedAssets || []).forEach(a => { m[a.label] = String(a.amount); });
    return m;
  }); // { [assetLabel]: amountString }
  const setMap = (label, v) => setMapAmt(prev => ({ ...prev, [label]: v }));
  const mappedTotal = assetHoldings.reduce((s, a) => s + (mapOpen ? parseAssetAmt(mapAmt[a.label]) : 0), 0);

  const mappedAssetsPayload = mapOpen
    ? assetHoldings
        .map(a => ({ id: `${a.sectionId}::${a.label}`, sectionId: a.sectionId, label: a.label, amount: parseAssetAmt(mapAmt[a.label]) }))
        .filter(x => x.amount > 0)
    : [];

  // `form` only tracks the fields this modal actually edits — it never carries
  // Create Log entries (those are only ever edited on the GoalDetail page's
  // Create Log section). Without this, the live preview here would silently
  // ignore every logged SIP change / portfolio valuation and show numbers
  // that don't match the goal's real, saved calculation.
  const previewCalc = calcGoal({ ...form, name: effectiveName, mappedAssets: mappedAssetsPayload, contributions: initial?.contributions || [] });
  const targetBeforeStart = monthsBetween(form.createdMonth, form.createdYear, form.targetMonth, form.targetYear) <= 0;

  const handleSave = () => {
    if (!effectiveName || targetBeforeStart || !form.amount) return;
    const createdAtDate = new Date(createdDate + 'T00:00:00');
    const createdAt = isNaN(createdAtDate.getTime()) ? (initial?.createdAt || new Date().toISOString()) : createdAtDate.toISOString();
    const normalized = {
      ...form,
      name: effectiveName,
      kidName: showKidName ? kidName.trim() : '',
      amount: Number(form.amount) || 0,
      inflation: Number(form.inflation) || 0,
      expectedReturn: Number(form.expectedReturn) || 0,
      sipIncRate: Number(form.sipIncRate) || 0,
      currentInv: Number(form.currentInv) || 0,
      currentSip: Number(form.currentSip) || 0,
      mappedAssets: mappedAssetsPayload,
      createdAt,
    };
    onSave(normalized);
  };

  return (
    <Modal
      title={isEdit ? 'Modify Goal parameters' : 'Configure New Goal'}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button onClick={handleSave} disabled={!effectiveName || targetBeforeStart || !form.amount} className={btnPrimary}>
              {isEdit ? 'Save Changes' : 'Configure Goal'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Goal Category Preset">
          <div className="relative">
            <select value={nameChoice} onChange={(e) => setNameChoice(e.target.value)} className={selectCls}>
              <option value="" disabled>Select target goal preset…</option>
              {GOAL_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {nameChoice === 'Others' && (
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Enter custom goal description"
              className={inputCls + ' mt-2 animate-fade-in'}
            />
          )}
          {showKidName && (
            <div className="mt-2 animate-fade-in">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Kid's Name</label>
              <input
                value={kidName}
                onChange={(e) => setKidName(e.target.value)}
                placeholder="e.g. Aanya"
                className={inputCls}
              />
            </div>
          )}
        </Field>
        <Field label="Target cost today (₹)">
          <input type="number" value={nv(form.amount)} onChange={(e) => upd('amount', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 50,00,000" />
        </Field>

        <Field label="Goal Created Date" hint="Backdate this if the goal already existed before using this app">
          <input type="date" value={createdDate} onChange={handleCreatedDateChange} max={new Date().toISOString().slice(0, 10)} className={inputCls} />
        </Field>
        <div className="hidden md:block" />

        <Field label="Target Month">
          <div className="relative">
            <select value={form.targetMonth} onChange={(e) => upd('targetMonth', Number(e.target.value))} className={selectCls}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Target Year">
          <input type="number" value={nv(form.targetYear)} onChange={(e) => upd('targetYear', parseNum(e, 0))} className={inputCls} />
        </Field>

        <Field label="Future cost (inflation-adjusted)">
          <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-bold tabular-nums shadow-sm">{fmtFull(previewCalc.futureValue)}</div>
        </Field>
        <Field label="Planning Horizon">
          <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 shadow-sm">
            {targetBeforeStart ? <span className="text-rose-600 dark:text-rose-400 font-bold">Target date must be in future</span> : <span className="tabular-nums font-semibold">{previewCalc.months} months ({previewCalc.years.toFixed(2)} yrs)</span>}
          </div>
        </Field>

        <Field label="Assumed Inflation Rate (%)">
          <input type="number" step="0.1" value={nv(form.inflation)} onChange={(e) => upd('inflation', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="Expected Portfolio Return (%)">
          <input type="number" step="0.1" value={nv(form.expectedReturn)} onChange={(e) => upd('expectedReturn', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="SIP Annual Step-Up (%)">
          <input type="number" step="0.1" value={nv(form.sipIncRate)} onChange={(e) => upd('sipIncRate', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="Existing Accumulated Corpus (₹)" hint={mappedTotal > 0 ? `Typed + ${fmtINR(mappedTotal)} mapped = ${fmtINR((Number(form.currentInv) || 0) + mappedTotal)} effective` : null}>
          <input type="number" value={nv(form.currentInv)} onChange={(e) => upd('currentInv', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 5,00,000" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Current Monthly SIP Allocation (₹)">
            <input type="number" value={nv(form.currentSip)} onChange={(e) => upd('currentSip', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 25,000" />
          </Field>
        </div>

        {/* Map Asset — seed the goal corpus from the client's existing asset allocation */}
        {hasAssets && (
          <div className="md:col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mapOpen}
                onChange={(e) => setMapOpen(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">
                <Link2 size={14} className="text-blue-600 dark:text-blue-400" /> Map Asset
              </span>
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Add part of this client's existing assets to the goal corpus
              </span>
            </label>

            {mapOpen && (
              <div className="mt-3 rounded-xl border border-blue-100 dark:border-slate-800 bg-blue-50/30 dark:bg-slate-950/40 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  <span>Asset · available / total</span>
                  <span>Amount to map (₹)</span>
                </div>
                {assetHoldings.map(a => {
                  const usedElsewhere = (usageByLabel[a.label] || []).reduce((s, u) => s + u.amount, 0);
                  const available = Math.max(0, a.amount - usedElsewhere);
                  const typed = parseAssetAmt(mapAmt[a.label]);
                  const overAllocated = typed > available;
                  return (
                    <div key={a.sectionId + a.label} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1">
                        <div className="flex items-center gap-2 min-w-[140px] flex-1 basis-40">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: a.color }} />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 break-words">{a.label}</span>
                          <span className="text-xs font-bold tabular-nums shrink-0 whitespace-nowrap">
                            <span className={usedElsewhere > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>{fmtINR(available)}</span>
                            <span className="text-slate-400 dark:text-slate-500"> / {fmtINR(a.amount)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto shrink-0">
                          <div className="relative w-32 sm:w-36 shrink-0">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 text-sm pointer-events-none">₹</span>
                            <input
                              type="number" min="0" max={available} step="any"
                              value={mapAmt[a.label] ?? ''}
                              onChange={(e) => setMap(a.label, e.target.value)}
                              placeholder="0"
                              className={inputCls + ` pl-7 !py-2 tabular-nums ${overAllocated ? '!border-rose-400 dark:!border-rose-700' : ''}`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setMap(a.label, String(available))}
                            className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline shrink-0 w-10 text-left cursor-pointer"
                            title="Map full available value"
                          >
                            All
                          </button>
                        </div>
                      </div>
                      {usedElsewhere > 0 && (
                        <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 pl-4.5">
                          Already used by: {(usageByLabel[a.label] || []).map(u => `${u.goalName} (${fmtINR(u.amount)})`).join(', ')}
                        </p>
                      )}
                      {overAllocated && (
                        <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 pl-4.5">
                          Exceeds available balance by {fmtINR(typed - available)}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-blue-100 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <Wallet size={13} /> Mapped to corpus
                  </span>
                  <span className="text-sm font-black text-blue-700 dark:text-blue-400 tabular-nums">{fmtINR(mappedTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 p-5 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-slate-950 dark:to-slate-900 border border-blue-100 dark:border-slate-800 rounded-xl shadow-sm">
        <PreviewTile label="Required Monthly SIP" value={fmtSip(previewCalc.sipRequired) + '/mo'} />
        <PreviewTile label="Additional SIP Needed" value={previewCalc.sipOnTrack ? null : (fmtSip(previewCalc.additionalSip) + '/mo')} pill={previewCalc.sipOnTrack ? 'On track' : null} />
        <PreviewTile label="Lump-sum Equivalent" value={fmtINR(previewCalc.lumpSumRequired)} />
        <PreviewTile label="Projected Progress" value={previewCalc.achievementPct.toFixed(1) + '%'} />
      </div>
    </Modal>
  );
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function findCol(header, ...candidates) {
  const h = header.toLowerCase().replace(/[\s.]/g, '');
  for (const c of candidates) if (h === c) return true;
  return false;
}

export function ExcelImportModal({ onClose, onImport }) {
  const fileRef = useRef();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setRows(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data.length) { setError('The sheet appears to be empty.'); return; }

        const headers = Object.keys(data[0]);
        const nameKey = headers.find(h => findCol(h, 'name', 'clientname', 'fullname'));
        const panKey  = headers.find(h => findCol(h, 'pan', 'panno', 'pannumber', 'pancard'));
        const ageKey  = headers.find(h => findCol(h, 'age', 'clientage', 'years'));

        if (!nameKey) { setError('Could not find a "Name" column in the sheet.'); return; }
        if (!panKey)  { setError('Could not find a "PAN" column in the sheet.'); return; }

        const parsed = data
          .map((r, i) => ({
            rowNum: i + 2,
            name: String(r[nameKey] || '').trim(),
            pan: String(r[panKey] || '').toUpperCase().trim(),
            age: ageKey ? (Number(r[ageKey]) || 0) : 0,
          }))
          .filter(r => r.name || r.pan);

        if (!parsed.length) { setError('No data rows found after the header.'); return; }
        setRows(parsed);
      } catch {
        setError('Failed to read the file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = rows ? rows.filter(r => r.name && PAN_RE.test(r.pan)) : [];

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(validRows);
      onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title="Import Client Portfolios"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {rows ? `${validRows.length} of ${rows.length} rows valid` : 'Upload a .xlsx / .xls file'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button
              onClick={handleImport}
              disabled={!validRows.length || importing}
              className={btnPrimary}
            >
              {importing ? 'Importing…' : `Import ${validRows.length} portfolio${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Drop zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600 hover:bg-blue-50/10 dark:hover:bg-blue-950/10 rounded-2xl p-8 flex flex-col items-center gap-2.5 transition-all text-slate-500 dark:text-slate-450 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shadow-inner"
        >
          <FileSpreadsheet size={32} className="text-slate-400 dark:text-slate-600" />
          <span className="font-bold text-sm uppercase tracking-wider">Click to upload spreadsheet</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-sans font-medium">Accepts Name, PAN Card, and Age columns — .xlsx / .xls formats</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

        {error && (
          <div className="flex items-start gap-2.5 p-4.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-xs font-medium border border-rose-200/50 dark:border-rose-900/40 animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {rows && (
          <div className="overflow-auto max-h-64 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left w-12">#</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">PAN</th>
                  <th className="px-4 py-3 text-left">Age</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r, i) => {
                  const nameOk = !!r.name;
                  const panOk = PAN_RE.test(r.pan);
                  const ok = nameOk && panOk;
                  return (
                    <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${ok ? 'bg-white dark:bg-slate-900' : 'bg-rose-50/20 dark:bg-rose-950/10'}`}>
                      <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500">{r.rowNum}</td>
                      <td className={`px-4 py-2.5 font-bold ${nameOk ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 dark:text-rose-400'}`}>
                        {r.name || <em className="font-normal font-sans text-xs opacity-60">empty</em>}
                      </td>
                      <td className={`px-4 py-2.5 font-mono tracking-wider text-xs ${panOk ? 'text-slate-800 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}`}>
                        {r.pan || <em className="font-normal font-sans tracking-normal opacity-60">empty</em>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 tabular-nums">
                        {r.age > 0 ? r.age : <em className="font-normal font-sans text-xs opacity-50">—</em>}
                      </td>
                      <td className="px-4 py-2.5 font-bold uppercase tracking-wider text-[10px]">
                        {ok
                          ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} /> Valid</span>
                          : <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><AlertCircle size={12} /> {!nameOk ? 'Missing name' : 'Invalid PAN'}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PreviewTile({ label, value, pill }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">{label}</p>
      {pill ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-250/50 dark:ring-emerald-900/50 rounded-full">
          <CheckCircle2 size={11} /> {pill}
        </span>
      ) : (
        <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      )}
    </div>
  );
}
