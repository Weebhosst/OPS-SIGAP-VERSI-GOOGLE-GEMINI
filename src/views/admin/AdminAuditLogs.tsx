/**
 * OPS SIGAP — Admin Audit Logs
 * Comprehensive chronological security audit trail
 */

import React, { useEffect, useState } from 'react';
import { History, ArrowLeft, Search, Filter, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { AuditLog } from '../../types/ops';

export const AdminAuditLogs: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadLogs = async () => {
    try {
      const res = await api.getAuditLogs();
      if (res.success) {
        setLogs(res.logs);
      }
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entityType.toLowerCase().includes(search.toLowerCase()) ||
      (l.reason && l.reason.toLowerCase().includes(search.toLowerCase())) ||
      l.actorUserId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-extrabold text-white text-base">Audit Trail Sistem</h1>
              <p className="text-[11px] text-slate-400 font-medium">Log Keamanan & Rekam Jejak Aktivitas</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-blue-400">
            {logs.length} Log Tercatat
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Cari aksi, entitas, atau detail alasan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Logs List */}
        <div className="space-y-2">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-400 font-mono text-[11px] bg-blue-950 px-2 py-0.5 rounded border border-blue-900">
                    {log.action}
                  </span>
                  <span className="text-white font-semibold">{log.actorUserId}</span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    [{log.entityType}: {log.entityId}]
                  </span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {new Date(log.createdAt).toLocaleString('id-ID')} WIB
                </span>
              </div>
              <div className="text-slate-300 font-mono text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800">
                {log.reason || (log.newValue ? JSON.stringify(log.newValue) : 'Aktivitas terekam')}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
