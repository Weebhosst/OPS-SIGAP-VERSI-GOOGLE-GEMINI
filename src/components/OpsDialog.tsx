import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';

export type OpsDialogTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type OpsDialogSize = 'sm' | 'md' | 'lg' | 'xl';

interface OpsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  tone?: OpsDialogTone;
  size?: OpsDialogSize;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  busy?: boolean;
  alert?: boolean;
}

const toneStyles: Record<OpsDialogTone, { iconWrap: string; title: string; icon: React.ReactNode }> = {
  info: {
    iconWrap: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    title: 'text-blue-100',
    icon: <Info className="h-5 w-5" />,
  },
  success: {
    iconWrap: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    title: 'text-emerald-100',
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  warning: {
    iconWrap: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    title: 'text-amber-100',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  danger: {
    iconWrap: 'border-red-500/30 bg-red-500/10 text-red-300',
    title: 'text-red-100',
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  neutral: {
    iconWrap: 'border-slate-700 bg-slate-800/70 text-slate-300',
    title: 'text-white',
    icon: <Info className="h-5 w-5" />,
  },
};

const sizeStyles: Record<OpsDialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const OpsDialog: React.FC<OpsDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  tone = 'neutral',
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
  busy = false,
  alert = false,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const busyRef = useRef(busy);
  const toneStyle = toneStyles[tone];

  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
    busyRef.current = busy;
  }, [onClose, closeOnEscape, busy]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus="true"]');
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred || firstFocusable || panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape' && closeOnEscapeRef.current && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`ops-dialog flex w-full ${sizeStyles[size]} flex-col overflow-hidden rounded-t-3xl border border-slate-700/90 bg-[#0f172a] shadow-2xl shadow-black/60 outline-none sm:rounded-3xl`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-800/90 bg-[#111c31]/95 px-4 py-4 sm:px-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneStyle.iconWrap}`}>
            {toneStyle.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={`text-sm font-black tracking-tight sm:text-base ${toneStyle.title}`}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Tutup ${title}`}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-200 sm:px-5">
            {children}
          </div>
        ) : null}

        {footer ? (
          <footer className="ops-safe-bottom sticky bottom-0 shrink-0 border-t border-slate-800/90 bg-[#0f172a]/98 px-4 pb-4 pt-3 backdrop-blur-xl sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};

interface OpsNoticeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  tone?: OpsDialogTone;
  buttonLabel?: string;
}

export const OpsNoticeDialog: React.FC<OpsNoticeDialogProps> = ({
  isOpen,
  onClose,
  title = 'Informasi',
  message,
  tone = 'info',
  buttonLabel = 'OK',
}) => (
  <OpsDialog
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    tone={tone}
    size="sm"
    alert={tone === 'danger' || tone === 'warning'}
    footer={
      <button type="button" data-autofocus="true" onClick={onClose} className="ops-btn-primary w-full px-4">
        {buttonLabel}
      </button>
    }
  >
    <p className="whitespace-pre-wrap break-words leading-6 text-slate-300">{message}</p>
  </OpsDialog>
);

interface OpsConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  tone?: OpsDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: React.ReactNode;
}

export const OpsConfirmDialog: React.FC<OpsConfirmDialogProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  tone = 'warning',
  confirmLabel = 'KONFIRMASI',
  cancelLabel = 'BATAL',
  children,
}) => {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) setSubmitting(false);
  }, [isOpen]);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OpsDialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={message}
      tone={tone}
      size="sm"
      busy={submitting}
      alert={tone === 'danger' || tone === 'warning'}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="ops-btn-secondary px-4">
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus="true"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className={`${tone === 'danger' ? 'ops-btn-danger' : 'ops-btn-primary'} px-4 disabled:opacity-40`}
          >
            {submitting ? 'MEMPROSES...' : confirmLabel}
          </button>
        </div>
      }
    >
      {children}
    </OpsDialog>
  );
};

interface OpsDangerConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmationText: string;
  entityLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: React.ReactNode;
}

export const OpsDangerConfirmDialog: React.FC<OpsDangerConfirmDialogProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  confirmationText,
  entityLabel = 'data',
  confirmLabel = 'HAPUS',
  cancelLabel = 'BATAL',
  children,
}) => {
  const [typedValue, setTypedValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
      setSubmitting(false);
    }
  }, [isOpen, confirmationText]);

  const normalizedExpected = useMemo(() => confirmationText.trim().toLocaleLowerCase('id-ID'), [confirmationText]);
  const normalizedTyped = typedValue.trim().toLocaleLowerCase('id-ID');
  const matches = normalizedExpected.length > 0 && normalizedTyped === normalizedExpected;

  const handleConfirm = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OpsDialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={message}
      tone="danger"
      size="md"
      busy={submitting}
      alert
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={submitting} className="ops-btn-secondary px-4">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!matches || submitting}
            className="ops-btn-danger px-4 disabled:opacity-35"
          >
            {submitting ? 'MEMPROSES...' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {children}
        <div className="rounded-2xl border border-red-900/70 bg-red-950/20 p-3">
          <p className="text-xs leading-5 text-red-200">
            Untuk melanjutkan, ketik ulang {entityLabel} berikut:
          </p>
          <div className="mt-2 select-all break-words rounded-xl border border-red-900/70 bg-slate-950 px-3 py-2 font-mono text-sm font-black text-red-300">
            {confirmationText}
          </div>
        </div>

        <label className="block text-xs font-bold text-slate-300">
          Konfirmasi {entityLabel}
          <input
            data-autofocus="true"
            autoComplete="off"
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            placeholder={`Ketik ${confirmationText}`}
            className={`ops-input mt-2 px-3 py-2 font-mono text-sm ${
              typedValue && !matches ? 'border-red-700/80 focus:border-red-500 focus:ring-red-500/10' : ''
            }`}
          />
        </label>

        {typedValue && !matches ? (
          <p className="text-xs font-semibold text-red-300">Teks konfirmasi belum sesuai.</p>
        ) : null}
      </div>
    </OpsDialog>
  );
};
