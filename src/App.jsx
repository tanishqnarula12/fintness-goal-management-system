import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Target, FileBarChart, Plus, ChevronLeft, Trash2, X,
  Calendar, Percent, Search, SlidersHorizontal, Pencil, Info, Shield, Plane, Car,
  Home, Heart, GraduationCap, Gift, CheckCircle2,
  AlertCircle, Download, RefreshCw, Save, FileText, Sun, Moon, LogOut, Wallet, PieChart
} from 'lucide-react';

// DB Service & Calculation Utils
import { 
  getClients, addClient, updateClient, deleteClient, addGoal, updateGoal, deleteGoal 
} from './services/db';
import {
  calcGoal, CURRENT_YEAR, CURRENT_MONTH, uid, monthsBetween, buildGoalEdits
} from './utils/calc';

// Subcomponents
import ClientList from './components/ClientList';
import ClientDetail from './components/ClientDetail';
import GoalDetail from './components/GoalDetail';
import { GoalsOverview, GoalGroupDetail } from './components/GoalsOverview';
import ReportsView from './components/ReportsView';
import { ClientFormModal, GoalFormModal, ExcelImportModal } from './components/Modals';
import { AssetAllocationList, AssetAllocationDetail } from './components/AssetAllocation';
import AssetAllocationModal from './components/AssetAllocationModal';
import { normalizeAllocation, buildAllocationEdits, hasAllocation } from './utils/assets';
import { StatTile } from './components/UI';
import Login from './components/Login';
import { isAuthenticated, setAuthenticated, clearAuthentication, isViewerRole } from './utils/auth';

// Assets
import logoImg from './assets/logo.png';

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [isViewer, setIsViewer] = useState(() => isViewerRole());
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('clients');

  const handleLogin = (role) => {
    setAuthenticated(role);
    setIsViewer(role === 'viewer');
    setAuthed(true);
  };

  const handleLogout = () => {
    clearAuthentication();
    setAuthed(false);
    setIsViewer(false);
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setSelectedGoalName(null);
  };
  
  // Selection States
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [selectedGoalName, setSelectedGoalName] = useState(null);
  
  // Modal states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);

  // Asset allocation tab states
  const [assetClientId, setAssetClientId] = useState(null);
  const [showAllocModal, setShowAllocModal] = useState(false);
  
  // Filters & Report view states
  const [reportGoalFilter, setReportGoalFilter] = useState('all');
  const [reportTimeframe, setReportTimeframe] = useState(5);

  // Dynamic light/dark theme preference
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('gms:theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('gms:theme', theme);
  }, [theme]);

  // Load clients on startup
  const loadData = async () => {
    try {
      const data = await getClients();
      setClients(data);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (authed) loadData();
  }, [authed]);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const selectedGoal = selectedClient?.goals?.find(g => g.id === selectedGoalId);
  const assetClient = clients.find(c => c.id === assetClientId);

  // Whenever either a goals-view client or an asset-allocation-view client is open,
  // we're "inside" a single client's profile — swap the main tab bar for a per-client sub-nav.
  const profileClientId = selectedClientId || assetClientId;
  const inClientProfile = Boolean(profileClientId);

  const goToGoalMapping = (clientId) => {
    setAssetClientId(null);
    setSelectedGoalId(null);
    setSelectedClientId(clientId);
    setTab('clients');
  };

  const goToAssetMapping = (clientId) => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(clientId);
    setTab('assets');
  };

  const backToClients = () => {
    setSelectedClientId(null);
    setSelectedGoalId(null);
    setAssetClientId(null);
    setTab('clients');
  };

  // Group goals for overview tab
  const allGoalNames = useMemo(() => {
    const map = new Map();
    clients.forEach(c => (c.goals || []).forEach(g => {
      const key = g.name.trim();
      if (!map.has(key)) map.set(key, { name: key, count: 0, clients: [] });
      const e = map.get(key);
      e.count++;
      e.clients.push({ id: c.id, name: c.name, goal: g });
    }));
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [clients]);

  // Calculate totals for active client
  const totals = useMemo(() => {
    if (!selectedClient || !selectedClient.goals) return { totalSip: 0, totalAdditional: 0, totalLump: 0, totalCurrentSip: 0 };
    let totalAdditional = 0, totalLump = 0, totalCurrentSip = 0;
    selectedClient.goals.forEach(g => {
      const c = calcGoal(g);
      totalAdditional += c.additionalSip;
      totalLump += c.lumpSumRequired;
      totalCurrentSip += (Number(g.currentSip) || 0);
    });
    // Total SIP is simply Current SIP + Additional SIP (signed)
    const totalSip = totalCurrentSip + totalAdditional;
    return { totalSip, totalAdditional, totalLump, totalCurrentSip };
  }, [selectedClient]);

  // Build global statistics
  const globalStats = useMemo(() => {
    const totalClients = clients.length;
    let activeGoals = 0;
    let clientsWithGoals = 0;
    let clientsWithoutGoals = 0;
    let clientsWithAllocation = 0;
    let clientsWithoutAllocation = 0;

    clients.forEach(c => {
      const gc = c.goals ? c.goals.length : 0;
      activeGoals += gc;
      if (gc > 0) clientsWithGoals++;
      else clientsWithoutGoals++;
      if (hasAllocation(c)) clientsWithAllocation++;
      else clientsWithoutAllocation++;
    });

    return {
      totalClients,
      activeGoals,
      clientsWithGoals,
      clientsWithoutGoals,
      clientsWithAllocation,
      clientsWithoutAllocation,
    };
  }, [clients]);

  // Build rows for Reports timeline tab
  const reportRows = useMemo(() => {
    const cutoffKey = (CURRENT_YEAR + reportTimeframe) * 12 + CURRENT_MONTH;
    const rows = [];
    clients.forEach(c => (c.goals || []).forEach(g => {
      const gKey = g.targetYear * 12 + (g.targetMonth || 1);
      if (gKey <= cutoffKey && (reportGoalFilter === 'all' || g.name === reportGoalFilter)) {
        rows.push({ clientName: c.name, clientId: c.id, goal: g, calc: calcGoal(g) });
      }
    }));
    return rows.sort((a, b) => {
      const ka = a.goal.targetYear * 12 + (a.goal.targetMonth || 1);
      const kb = b.goal.targetYear * 12 + (b.goal.targetMonth || 1);
      return ka - kb;
    });
  }, [clients, reportGoalFilter, reportTimeframe]);

  // Operations wrapped in try-catch and reload triggers
  const handleAddClient = async (name, pan, age) => {
    const newClient = { id: uid(), name, pan, age: Number(age) || 0 };
    try {
      await addClient(newClient);
      await loadData();
    } catch (err) {
      alert('Error adding client: ' + err.message);
    }
  };

  const handleUpdateClient = async (clientId, updates) => {
    try {
      await updateClient(clientId, updates);
      await loadData();
    } catch (err) {
      alert('Error updating client: ' + err.message);
    }
  };

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client and all their goals? This action cannot be undone.')) return;
    try {
      await deleteClient(clientId);
      if (selectedClientId === clientId) setSelectedClientId(null);
      await loadData();
    } catch (err) {
      alert('Error deleting client: ' + err.message);
    }
  };

  const handleAddGoal = async (clientId, goal) => {
    const newGoal = { ...goal, id: uid() };
    try {
      await addGoal(clientId, newGoal);
      await loadData();
    } catch (err) {
      alert('Error adding goal: ' + err.message);
    }
  };

  const handleUpdateGoal = async (clientId, goalId, updates) => {
    try {
      await updateGoal(clientId, goalId, updates);
      await loadData();
    } catch (err) {
      alert('Error updating goal: ' + err.message);
    }
  };

  const handleDeleteGoal = async (clientId, goalId) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;
    try {
      await deleteGoal(clientId, goalId);
      if (selectedGoalId === goalId) setSelectedGoalId(null);
      await loadData();
    } catch (err) {
      alert('Error deleting goal: ' + err.message);
    }
  };

  const handleSaveAssumptions = async (clientId, text) => {
    await handleUpdateClient(clientId, { assumptions: text });
  };

  // Save an asset-allocation patch (full form payload, or a remark-only patch).
  // Diffs against the previous allocation and appends an edit-history entry.
  const handleSaveAllocation = async (clientId, patch) => {
    const client = clients.find(c => c.id === clientId);
    const prev = normalizeAllocation(client?.assetAllocation);
    const merged = normalizeAllocation({
      values: patch.values || prev.values,
      custom: patch.custom || prev.custom,
      remark: patch.remark !== undefined ? patch.remark : prev.remark,
      peRatio: patch.peRatio !== undefined ? patch.peRatio : prev.peRatio,
    });
    const changes = buildAllocationEdits(prev, merged);
    if (changes.length === 0) return; // nothing actually changed — skip the write
    const history = [...prev.history, { at: new Date().toISOString(), changes }];
    const assetAllocation = { ...merged, history, updatedAt: new Date().toISOString() };
    await handleUpdateClient(clientId, { assetAllocation });
  };

  const handleImportClients = async (rows) => {
    for (const r of rows) {
      const newClient = { id: uid(), name: r.name, pan: r.pan, age: Number(r.age) || 0 };
      try {
        await addClient(newClient);
      } catch (err) {
        alert(`Error importing ${r.name}: ${err.message}`);
      }
    }
    await loadData();
  };

  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        <span className="font-semibold text-sm animate-pulse">Initializing Financial Workspace...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300 antialiased font-sans">
      {/* App Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} className="h-9 w-9 object-contain rounded-xl" alt="Team Fintness Logo" />
            <div className="leading-tight">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Team Fintness</h1>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Goal Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3.5 py-1.5 rounded-full">FY {CURRENT_YEAR}</span>
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900/40 transition-all shadow-sm cursor-pointer"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Global Summary Statistics Dashboard */}
        {!inClientProfile && !selectedGoalName && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6 animate-fade-in">
            <StatTile label="Total Clients" value={globalStats.totalClients} icon={Users} accent="blue" />
            <StatTile label="Clients with Goals" value={globalStats.clientsWithGoals} icon={CheckCircle2} accent="emerald" />
            <StatTile label="Clients without Goals" value={globalStats.clientsWithoutGoals} icon={AlertCircle} accent="amber" />
            <StatTile label="Total Goals" value={globalStats.activeGoals} icon={Target} accent="indigo" />
            <StatTile label="Clients with Asset Allocation" value={globalStats.clientsWithAllocation} icon={Wallet} accent="emerald" />
            <StatTile label="Clients without Asset Allocation" value={globalStats.clientsWithoutAllocation} icon={PieChart} accent="amber" />
          </div>
        )}

        {/* Navigation Tabs (top-level) OR per-client profile sub-nav */}
        {!inClientProfile ? (
          <div className="w-full overflow-x-auto mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
              {[
                { id: 'clients', label: 'Clients', icon: Users },
                { id: 'goals', label: 'Goals Summary', icon: Target },
                { id: 'assets', label: 'Asset Allocation', icon: Wallet },
                { id: 'reports', label: 'Timeline Reports', icon: FileBarChart }
              ].map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      setSelectedClientId(null);
                      setSelectedGoalId(null);
                      setSelectedGoalName(null);
                      setAssetClientId(null);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                      active
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden animate-fade-in">
            <div className="inline-flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
              <button
                onClick={backToClients}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              >
                <ChevronLeft size={14} />
                Back to Clients
              </button>
              <button
                onClick={() => goToGoalMapping(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  selectedClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Target size={14} />
                Goal Mapping
              </button>
              <button
                onClick={() => goToAssetMapping(profileClientId)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  assetClientId
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Wallet size={14} />
                Asset Allocation Mapping
              </button>
            </div>
          </div>
        )}

        {/* Tab Routing */}
        {tab === 'clients' && !selectedClientId && (
          <div className="animate-scale-up">
            <ClientList
              clients={clients}
              onSelect={setSelectedClientId}
              onAdd={() => setShowAddClient(true)}
              onDelete={handleDeleteClient}
              onImport={() => setShowImportExcel(true)}
              isViewer={isViewer}
            />
          </div>
        )}
        
        {tab === 'clients' && selectedClientId && !selectedGoalId && (
          <div className="animate-scale-up">
            <ClientDetail
              client={selectedClient}
              totals={totals}
              onAddGoal={() => { setEditingGoalId(null); setShowGoalForm(true); }}
              onSelectGoal={setSelectedGoalId}
              onDeleteGoal={(gid) => handleDeleteGoal(selectedClientId, gid)}
              onSaveAssumptions={(text) => handleSaveAssumptions(selectedClientId, text)}
              onEditClient={() => { setEditingClientId(selectedClientId); setShowAddClient(true); }}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'clients' && selectedGoalId && (
          <div className="animate-scale-up">
            <GoalDetail
              goal={selectedGoal}
              clientName={selectedClient.name}
              onBack={() => setSelectedGoalId(null)}
              onEdit={() => { setEditingGoalId(selectedGoalId); setShowGoalForm(true); }}
              onSaveContributions={(contributions, changes) => {
                const prevHistory = Array.isArray(selectedGoal?.history) ? selectedGoal.history : [];
                const history = (changes && changes.length)
                  ? [...prevHistory, { at: new Date().toISOString(), changes }]
                  : prevHistory;
                handleUpdateGoal(selectedClientId, selectedGoalId, { contributions, history });
              }}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'goals' && !selectedGoalName && (
          <div className="animate-scale-up">
            <GoalsOverview goalGroups={allGoalNames} onSelect={setSelectedGoalName} />
          </div>
        )}

        {tab === 'goals' && selectedGoalName && (
          <div className="animate-scale-up">
            <GoalGroupDetail
              groupName={selectedGoalName}
              entries={allGoalNames.find(g => g.name === selectedGoalName)?.clients || []}
              onBack={() => setSelectedGoalName(null)}
              onSelectClient={(cid) => { setTab('clients'); setSelectedClientId(cid); setSelectedGoalName(null); }}
            />
          </div>
        )}

        {tab === 'assets' && !assetClientId && (
          <div className="animate-scale-up">
            <AssetAllocationList clients={clients} onSelect={setAssetClientId} />
          </div>
        )}

        {tab === 'assets' && assetClientId && assetClient && (
          <div className="animate-scale-up">
            <AssetAllocationDetail
              client={assetClient}
              onEdit={() => setShowAllocModal(true)}
              onSaveRemark={(remark) => handleSaveAllocation(assetClientId, { remark })}
              isViewer={isViewer}
            />
          </div>
        )}

        {tab === 'reports' && (
          <div className="animate-scale-up">
            <ReportsView
              goalNames={allGoalNames.map(g => g.name)}
              goalFilter={reportGoalFilter}
              setGoalFilter={setReportGoalFilter}
              timeframe={reportTimeframe}
              setTimeframe={setReportTimeframe}
              rows={reportRows}
              onOpenClient={(cid) => { setTab('clients'); setSelectedClientId(cid); }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-10 text-xs text-slate-400 dark:text-slate-500 text-center border-t border-slate-200/40 dark:border-slate-800/40 mt-12">
        © {CURRENT_YEAR} Team Fintness · Building fitter financial futures
      </footer>

      {/* Modals */}
      {showAddClient && (
        <ClientFormModal 
          initial={editingClientId ? clients.find(c => c.id === editingClientId) : null}
          onClose={() => { setShowAddClient(false); setEditingClientId(null); }} 
          onSave={async (name, pan, age) => {
            if (editingClientId) {
              await handleUpdateClient(editingClientId, { name, pan, age: Number(age) || 0 });
            } else {
              await handleAddClient(name, pan, age);
            }
            setShowAddClient(false);
            setEditingClientId(null);
          }} 
        />
      )}
      
      {showImportExcel && (
        <ExcelImportModal
          onClose={() => setShowImportExcel(false)}
          onImport={handleImportClients}
        />
      )}

      {showAllocModal && assetClient && (
        <AssetAllocationModal
          clientName={assetClient.name}
          initial={assetClient.assetAllocation}
          onClose={() => setShowAllocModal(false)}
          onSave={(patch) => {
            handleSaveAllocation(assetClientId, patch);
            setShowAllocModal(false);
          }}
        />
      )}

      {showGoalForm && selectedClient && (
        <GoalFormModal
          initial={editingGoalId ? selectedClient.goals.find(g => g.id === editingGoalId) : null}
          assetAllocation={selectedClient.assetAllocation}
          clientGoals={selectedClient.goals}
          onClose={() => { setShowGoalForm(false); setEditingGoalId(null); }}
          onSave={(g) => {
            if (editingGoalId) {
              const prev = selectedClient.goals.find(x => x.id === editingGoalId);
              const changes = prev ? buildGoalEdits(prev, g) : [];
              const prevHistory = Array.isArray(prev?.history) ? prev.history : [];
              const history = changes.length
                ? [...prevHistory, { at: new Date().toISOString(), changes }]
                : prevHistory;
              handleUpdateGoal(selectedClient.id, editingGoalId, { ...g, history });
            } else {
              handleAddGoal(selectedClient.id, { ...g, createdAt: g.createdAt || new Date().toISOString(), history: [] });
            }
            setShowGoalForm(false);
            setEditingGoalId(null);
          }}
        />
      )}
    </div>
  );
}
