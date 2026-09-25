import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, X } from 'lucide-react';

type ConfirmTone = 'danger' | 'warning' | 'primary';

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  requireText?: string;
  requireTextLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

const toneClass: Record<ConfirmTone, string> = {
  danger: 'bg-red-600 hover:bg-red-500 focus:ring-red-400/30',
  warning: 'bg-amber-600 hover:bg-amber-500 focus:ring-amber-400/30',
  primary: 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-400/30',
};

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  tone = 'danger',
  requireText,
  requireTextLabel,
  busy = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const [typedValue, setTypedValue] = useState('');

  useEffect(() => {
    if (!open) setTypedValue('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const normalizedRequired = requireText?.trim() || '';
  const canConfirm = !busy && (!normalizedRequired || typedValue.trim() === normalizedRequired);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        className="ops-dialog flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/60"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800 bg-[#08111f]/95 p-4 backdrop-blur-xl">
          <div className="flex min-w-0 gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              tone === 'danger'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : tone === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
            }`}>
              {tone === 'danger' ? <Trash2 className="h-5 w-5" /> : tone === 'warning' ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Konfirmasi Aksi</p>
              <h2 id="confirm-action-title" className="mt-1 break-words text-base font-black text-white">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Tutup konfirmasi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          {description ? <p className="text-sm leading-6 text-slate-300">{description}</p> : null}
          {children}

          {normalizedRequired ? (
            <div className="rounded-2xl border border-red-900/70 bg-red-950/20 p-4">
              <label className="block text-xs font-bold text-slate-300">
                {requireTextLabel || 'Ketik ulang nama data berikut untuk melanjutkan:'}
                <span className="mt-2 block break-all rounded-xl border border-red-900/60 bg-[#020817] px-3 py-2 font-mono text-xs font-black text-red-200">
                  {normalizedRequired}
                </span>
                <input
                  autoFocus
                  value={typedValue}
                  onChange={(event) => setTypedValue(event.target.value)}
                  placeholder={normalizedRequired}
                  className="mt-3 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                />
              </label>
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-slate-800 bg-[#08111f]/95 p-4 backdrop-blur-xl">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-black text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void onConfirm()}
            className={`min-h-11 rounded-xl px-4 text-xs font-black text-white shadow-lg transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-40 ${toneClass[tone]}`}
          >
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
};
