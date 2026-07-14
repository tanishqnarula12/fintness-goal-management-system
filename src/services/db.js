import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';
import { CURRENT_YEAR, CURRENT_MONTH } from '../utils/calc';

const seedData = {
  clients: [
    { id: 'c1', name: 'Aarav Sharma', pan: 'ABCPS1234A', age: 34, assumptions: '', goals: [
      { id: 'g1', name: 'Financial Freedom', amount: 50000000, targetMonth: 4, targetYear: CURRENT_YEAR + 25, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 12, sipIncRate: 10, currentInv: 500000, currentSip: 25000 },
      { id: 'g2', name: 'Kids Education', amount: 4000000, targetMonth: 6, targetYear: CURRENT_YEAR + 12, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 8, expectedReturn: 11, sipIncRate: 8, currentInv: 200000, currentSip: 15000, kidName: 'Aanya', history: [] },
    ]},
    { id: 'c2', name: 'Priya Patel', pan: 'BXYPP5678B', age: 41, assumptions: '', goals: [
      { id: 'g3', name: 'Financial Freedom', amount: 80000000, targetMonth: 3, targetYear: CURRENT_YEAR + 19, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 11, sipIncRate: 10, currentInv: 1500000, currentSip: 40000 },
      { id: 'g4', name: 'Dream Home', amount: 15000000, targetMonth: 10, targetYear: CURRENT_YEAR + 5, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 7, expectedReturn: 9, sipIncRate: 5, currentInv: 3000000, currentSip: 50000 },
    ]},
    { id: 'c3', name: 'Rohan Mehta', pan: 'CQRPM9012C', age: 28, assumptions: '', goals: [
      { id: 'g5', name: 'Financial Freedom', amount: 30000000, targetMonth: 4, targetYear: CURRENT_YEAR + 32, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 6, expectedReturn: 13, sipIncRate: 12, currentInv: 100000, currentSip: 10000 },
    ]},
    { id: 'c4', name: 'Sneha Iyer', pan: 'DLMPI3456D', age: 38, assumptions: '', goals: []},
    { id: 'c5', name: 'Vikram Singh', pan: 'EFGPS7890E', age: 45, assumptions: '', goals: [
      { id: 'g6', name: 'Kids Education', amount: 6000000, targetMonth: 7, targetYear: CURRENT_YEAR + 8, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 8, expectedReturn: 11, sipIncRate: 8, currentInv: 800000, currentSip: 30000, kidName: 'Reyansh', history: [] },
      { id: 'g7', name: 'Vacation', amount: 2000000, targetMonth: 12, targetYear: CURRENT_YEAR + 3, createdMonth: CURRENT_MONTH, createdYear: CURRENT_YEAR, inflation: 5, expectedReturn: 8, sipIncRate: 0, currentInv: 500000, currentSip: 25000 },
    ]},
  ],
};

// Map database goal row to frontend goal object
function mapDbGoal(g) {
  return {
    id: g.id,
    name: g.name,
    amount: Number(g.amount),
    targetMonth: g.target_month,
    targetYear: g.target_year,
    createdMonth: g.created_month,
    createdYear: g.created_year,
    inflation: Number(g.inflation),
    expectedReturn: Number(g.expected_return),
    sipIncRate: Number(g.sip_inc_rate),
    currentInv: Number(g.current_inv),
    currentSip: Number(g.current_sip),
    kidName: g.kid_name || '',
    history: Array.isArray(g.history) ? g.history : [],
    actuals: Array.isArray(g.actuals) ? g.actuals : [],
    mappedAssets: Array.isArray(g.mapped_assets) ? g.mapped_assets : [],
    contributions: Array.isArray(g.contributions) ? g.contributions : [],
    createdAt: g.created_at || null
  };
}

// Map frontend goal object to database goal row
function mapFrontendGoal(g, clientId) {
  return {
    id: g.id,
    client_id: clientId,
    name: g.name,
    amount: g.amount,
    target_month: g.targetMonth,
    target_year: g.targetYear,
    created_month: g.createdMonth,
    created_year: g.createdYear,
    inflation: g.inflation,
    expected_return: g.expectedReturn,
    sip_inc_rate: g.sipIncRate,
    current_inv: g.currentInv,
    current_sip: g.currentSip,
    kid_name: g.kidName || null,
    history: Array.isArray(g.history) ? g.history : [],
    actuals: Array.isArray(g.actuals) ? g.actuals : [],
    mapped_assets: Array.isArray(g.mappedAssets) ? g.mappedAssets : [],
    contributions: Array.isArray(g.contributions) ? g.contributions : [],
    ...(g.createdAt ? { created_at: g.createdAt } : {})
  };
}

// Fetch helper to sync and seed if empty
export async function getClients() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('clients')
      .select('*, goals(*)');
    if (error) throw error;

    return data.map(client => ({
      id: client.id,
      name: client.name,
      pan: client.pan,
      age: client.age,
      assumptions: client.assumptions || '',
      assetAllocation: client.asset_allocation || null,
      goals: (client.goals || []).map(mapDbGoal)
    }));
  } else {
    const local = localStorage.getItem('app-state');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.clients && parsed.clients.length > 0) {
          return parsed.clients;
        }
      } catch (e) {
        console.error('Failed to parse local storage, using seeds', e);
      }
    }
    // Seed local storage if empty
    localStorage.setItem('app-state', JSON.stringify(seedData));
    return seedData.clients;
  }
}

// Write helper for local storage updates
function saveToLocalStorage(clients) {
  localStorage.setItem('app-state', JSON.stringify({ clients }));
}

// Core Operations
export async function addClient(client) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('clients').insert({
      id: client.id,
      name: client.name,
      pan: client.pan,
      age: client.age,
      assumptions: ''
    });
    if (error) throw error;
  } else {
    const clients = await getClients();
    clients.push({ ...client, assumptions: '', goals: [] });
    saveToLocalStorage(clients);
  }
}

export async function updateClient(clientId, updates) {
  if (isSupabaseConfigured) {
    // Translate frontend (camelCase) keys to DB column names
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.pan !== undefined) dbUpdates.pan = updates.pan;
    if (updates.age !== undefined) dbUpdates.age = updates.age;
    if (updates.assumptions !== undefined) dbUpdates.assumptions = updates.assumptions;
    if (updates.assetAllocation !== undefined) dbUpdates.asset_allocation = updates.assetAllocation;

    const { error } = await supabase
      .from('clients')
      .update(dbUpdates)
      .eq('id', clientId);
    if (error) throw error;
  } else {
    const clients = await getClients();
    const updated = clients.map(c => c.id === clientId ? { ...c, ...updates } : c);
    saveToLocalStorage(updated);
  }
}

export async function deleteClient(clientId) {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);
    if (error) throw error;
  } else {
    const clients = await getClients();
    const filtered = clients.filter(c => c.id !== clientId);
    saveToLocalStorage(filtered);
  }
}

export async function addGoal(clientId, goal) {
  if (isSupabaseConfigured) {
    const dbGoal = mapFrontendGoal(goal, clientId);
    const { error } = await supabase.from('goals').insert(dbGoal);
    if (error) throw error;
  } else {
    const clients = await getClients();
    const updated = clients.map(c => {
      if (c.id === clientId) {
        return { ...c, goals: [...(c.goals || []), goal] };
      }
      return c;
    });
    saveToLocalStorage(updated);
  }
}

export async function updateGoal(clientId, goalId, updates) {
  if (isSupabaseConfigured) {
    // Map updates if they match mapped names
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.targetMonth !== undefined) dbUpdates.target_month = updates.targetMonth;
    if (updates.targetYear !== undefined) dbUpdates.target_year = updates.targetYear;
    if (updates.createdMonth !== undefined) dbUpdates.created_month = updates.createdMonth;
    if (updates.createdYear !== undefined) dbUpdates.created_year = updates.createdYear;
    if (updates.createdAt !== undefined) dbUpdates.created_at = updates.createdAt;
    if (updates.inflation !== undefined) dbUpdates.inflation = updates.inflation;
    if (updates.expectedReturn !== undefined) dbUpdates.expected_return = updates.expectedReturn;
    if (updates.sipIncRate !== undefined) dbUpdates.sip_inc_rate = updates.sipIncRate;
    if (updates.currentInv !== undefined) dbUpdates.current_inv = updates.currentInv;
    if (updates.currentSip !== undefined) dbUpdates.current_sip = updates.currentSip;
    if (updates.kidName !== undefined) dbUpdates.kid_name = updates.kidName || null;
    if (updates.history !== undefined) dbUpdates.history = Array.isArray(updates.history) ? updates.history : [];
    if (updates.actuals !== undefined) dbUpdates.actuals = Array.isArray(updates.actuals) ? updates.actuals : [];
    if (updates.mappedAssets !== undefined) dbUpdates.mapped_assets = Array.isArray(updates.mappedAssets) ? updates.mappedAssets : [];
    if (updates.contributions !== undefined) dbUpdates.contributions = Array.isArray(updates.contributions) ? updates.contributions : [];

    const { error } = await supabase
      .from('goals')
      .update(dbUpdates)
      .eq('id', goalId);
    if (error) throw error;
  } else {
    const clients = await getClients();
    const updated = clients.map(c => {
      if (c.id === clientId) {
        return {
          ...c,
          goals: c.goals.map(g => g.id === goalId ? { ...g, ...updates } : g)
        };
      }
      return c;
    });
    saveToLocalStorage(updated);
  }
}

export async function deleteGoal(clientId, goalId) {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId);
    if (error) throw error;
  } else {
    const clients = await getClients();
    const updated = clients.map(c => {
      if (c.id === clientId) {
        return { ...c, goals: c.goals.filter(g => g.id !== goalId) };
      }
      return c;
    });
    saveToLocalStorage(updated);
  }
}
