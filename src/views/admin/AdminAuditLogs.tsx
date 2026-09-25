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
    <div className="min-h-screen bg-[#020817] pb-10 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#08111f]/95 px-4 py-3 backdrop-blur-xl lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">Audit Trail Sistem</h1>
              <p className="text-[11px] text-slate-400 font-medium">Log Keamanan & Rekam Jejak Aktivitas</p>
            </div>
          </div>
          <span className="rounded-full border border-blue-800/60 bg-blue-950/50 px-2.5 py-1 font-mono text-[10px] font-black text-blue-300">
            {logs.length} Log Tercatat
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:px-6 lg:pt-6">
        {/* Search */}
        <div className="relative rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-black/10">
          <Search className="absolute left-6 top-6 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Cari aksi, entitas, atau detail alasan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
        </div>

        {/* Logs List */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs shadow-lg shadow-black/10"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-blue-900 bg-blue-950 px-2 py-1 font-mono text-[10px] font-black text-blue-300">
                    {log.action}
                  </span>
                  <span className="text-xs font-bold text-white">{log.actorUserId}</span>
                  <span className="break-all font-mono text-[10px] text-slate-500">
                    [{log.entityType}: {log.entityId}]
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  {new Date(log.createdAt).toLocaleString('id-ID')} WIB
                </span>
              </div>
              <div className="break-words rounded-xl border border-slate-800 bg-slate-950/70 p-3 font-mono text-[11px] leading-5 text-slate-300">
                {log.reason || (log.newValue ? JSON.stringify(log.newValue) : 'Aktivitas terekam')}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
