import React, { useState, useEffect } from 'react';
import {
  Leaf, Camera, ChefHat, AlertTriangle, CheckCircle2,
  Trash2, Sparkles, DollarSign, CloudRain, Plus, Loader2, Server
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

export default function App() {
  const [inventory, setInventory] = useState([]);
  const [impact, setImpact] = useState({ co2_saved: 0, money_saved: 0, items_rescued: 0 });
  const [recipes, setRecipes] = useState([]);
  const [loadingScan, setLoadingScan] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', category: 'produce', days_left: 3 });

  const fetchState = async () => {
    try {
      const res = await fetch(`${API_BASE}/state`);
      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();
      setInventory(data.inventory);
      setImpact(data.impact);
      setBackendConnected(true);
    } catch (err) {
      setBackendConnected(false);
    }
  };

  useEffect(() => { fetchState(); }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setLoadingScan(true);
    try {
      const res = await fetch(`${API_BASE}/scan`, { method: 'POST', body: formData });
      if (res.ok) await fetchState();
      else alert('Scan failed. Ensure GEMINI_API_KEY is in backend/.env');
    } catch (err) {
      alert('Could not reach backend server.');
    } finally {
      setLoadingScan(false);
      e.target.value = '';
    }
  };

  const generateRecipes = async () => {
    setLoadingRecipes(true);
    try {
      const res = await fetch(`${API_BASE}/recipes`, { method: 'POST' });
      const data = await res.json();
      setRecipes(data.recipes || []);
    } catch (err) {
      alert('Failed to generate recipes.');
    } finally {
      setLoadingRecipes(false);
    }
  };

  const rescueItem = async (id) => {
    await fetch(`${API_BASE}/items/${id}/rescue`, { method: 'POST' });
    await fetchState();
  };

  const deleteItem = async (id) => {
    await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
    await fetchState();
  };

  const addManualItem = async (e) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, days_left: Number(newItem.days_left), quantity: '1 unit' })
    });
    setNewItem({ name: '', category: 'produce', days_left: 3 });
    await fetchState();
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      <header className="bg-emerald-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-500 p-2 rounded-xl">
              <Leaf className="w-6 h-6 text-emerald-950" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ShelfLife AI</h1>
              <p className="text-xs text-emerald-200">Zero-Waste Kitchen & Expiry Prevention</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs bg-emerald-800 px-3 py-1.5 rounded-full">
            <Server className="w-3.5 h-3.5 text-emerald-300" />
            <span>API: <strong className={backendConnected ? 'text-emerald-300' : 'text-red-300'}>{backendConnected ? 'Connected (FastAPI + SQLite)' : 'Offline'}</strong></span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 flex items-center gap-4">
            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-700"><CloudRain className="w-6 h-6" /></div>
            <div>
              <p className="text-xs uppercase text-stone-500">CO₂e Prevented</p>
              <p className="text-2xl font-bold">{impact.co2_saved} kg</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-stone-200 flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-xl text-amber-700"><DollarSign className="w-6 h-6" /></div>
            <div>
              <p className="text-xs uppercase text-stone-500">Grocery Money Saved</p>
              <p className="text-2xl font-bold">${impact.money_saved}</p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-stone-200 flex items-center gap-4">
            <div className="bg-teal-100 p-3 rounded-xl text-teal-700"><CheckCircle2 className="w-6 h-6" /></div>
            <div>
              <p className="text-xs uppercase text-stone-500">Ingredients Rescued</p>
              <p className="text-2xl font-bold">{impact.items_rescued} items</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Smart Fridge Tracker</h2>
              <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2">
                {loadingScan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                <span>{loadingScan ? 'Scanning...' : 'Scan Fridge / Receipt'}</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            <form onSubmit={addManualItem} className="flex gap-2 bg-white p-3 rounded-xl border border-stone-200">
              <input type="text" placeholder="Add item (e.g. Avocados)" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="flex-1 text-sm px-2 focus:outline-none" />
              <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="text-xs bg-stone-100 rounded-lg px-2 py-1.5">
                <option value="produce">Produce</option><option value="dairy">Dairy</option><option value="meat">Meat</option><option value="grains">Grains</option>
              </select>
              <input type="number" min="1" max="365" value={newItem.days_left} onChange={(e) => setNewItem({ ...newItem, days_left: e.target.value })} className="w-16 text-xs bg-stone-100 rounded-lg text-center" />
              <button type="submit" className="bg-stone-900 text-white p-2 rounded-lg hover:bg-stone-800"><Plus className="w-4 h-4" /></button>
            </form>

            <div className="space-y-2.5">
              {inventory.map((item) => {
                const isUrgent = item.days_left <= 2;
                return (
                  <div key={item.id} className={`p-4 rounded-xl border flex items-center justify-between ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-white border-stone-200'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 capitalize">{item.category}</span>
                      </div>
                      <p className={`text-xs mt-1 font-medium flex items-center gap-1 ${isUrgent ? 'text-red-600' : 'text-emerald-700'}`}>
                        {isUrgent && <AlertTriangle className="w-3.5 h-3.5" />}
                        {item.days_left === 1 ? 'Expires tomorrow!' : `Expires in ${item.days_left} days`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => rescueItem(item.id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg">Used / Rescued</button>
                      <button onClick={() => deleteItem(item.id)} className="text-stone-400 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Zero-Waste Chef</h2>
              <button onClick={generateRecipes} disabled={loadingRecipes || inventory.length === 0} className="bg-stone-900 hover:bg-stone-800 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
                {loadingRecipes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                <span>Cook Expiring Items</span>
              </button>
            </div>

            {recipes.length === 0 ? (
              <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-10 text-center space-y-3">
                <ChefHat className="w-10 h-10 text-stone-400 mx-auto" />
                <h3 className="font-semibold text-stone-800">Turn Expiring Groceries Into Dinner</h3>
                <p className="text-sm text-stone-500">Click <strong>Cook Expiring Items</strong> to generate custom recipes.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recipes.map((recipe, index) => (
                  <div key={index} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-bold">{recipe.title}</h3>
                      <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">{recipe.prepTime}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.urgentUsed?.map((ing, i) => (
                        <span key={i} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 rounded-full">Rescues: {ing}</span>
                      ))}
                    </div>
                    <ol className="space-y-2 text-sm text-stone-700 list-decimal list-inside">
                      {recipe.steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}