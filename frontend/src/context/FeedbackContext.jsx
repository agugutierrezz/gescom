import { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Feedback de UI: toasts (éxito/error/info) y diálogo de confirmación propio,
 * en reemplazo de window.alert / window.confirm del navegador.
 *
 * Uso:
 *   const { toast, confirm } = useFeedback();
 *   toast('Reserva creada con éxito.');                      // success por defecto
 *   toast('No se pudo guardar.', 'error');
 *   const ok = await confirm({ title, message, confirmLabel, danger });
 */
const FeedbackContext = createContext(null);

const TOAST_DURATION_MS = 4000;

const TOAST_STYLES = {
  success: { icon: 'check_circle', accent: 'border-tertiary', text: 'text-tertiary' },
  error: { icon: 'error', accent: 'border-error', text: 'text-error' },
  info: { icon: 'info', accent: 'border-primary', text: 'text-primary' },
};

function Toast({ toast, onDismiss }) {
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 w-96 max-w-[90vw] bg-surface-container-lowest border-l-4 ${style.accent} rounded-lg shadow-warm px-4 py-3 pointer-events-auto animate-[toast-in_0.25s_ease-out]`}
    >
      <span className={`material-symbols-outlined text-[22px] ${style.text}`}>{style.icon}</span>
      <p className="flex-1 text-body-base text-on-surface">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 text-outline hover:text-on-surface transition-colors"
        aria-label="Cerrar notificación"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}

function ConfirmDialog({ dialog, onResolve }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4"
      onClick={() => onResolve(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-surface-container-lowest rounded-xl shadow-warm w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <span
            className={`material-symbols-outlined text-[26px] mt-0.5 ${
              dialog.danger ? 'text-error' : 'text-primary'
            }`}
          >
            {dialog.danger ? 'warning' : 'help'}
          </span>
          <h3 id="confirm-title" className="text-h3 text-on-surface">
            {dialog.title}
          </h3>
        </div>
        <p className="text-body-base text-on-surface-variant mb-6 pl-[38px]">{dialog.message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onResolve(false)}
            autoFocus
            className="h-11 px-5 border border-[#C8A96E]/30 text-on-surface text-body-semibold rounded-lg hover:bg-surface-variant/20 transition-colors"
          >
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className={`h-11 px-5 text-body-semibold rounded-lg shadow-sm transition-colors ${
              dialog.danger
                ? 'bg-error hover:bg-error/90 text-on-error'
                : 'bg-primary-container hover:bg-surface-tint text-on-primary'
            }`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null); // { title, message, ..., resolve }
  const nextId = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, type = 'success') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast]
  );

  const confirm = useCallback(
    ({
      title = 'Confirmar',
      message,
      confirmLabel = 'Confirmar',
      cancelLabel = 'Cancelar',
      danger = false,
    }) =>
      new Promise((resolve) => {
        setDialog({ title, message, confirmLabel, cancelLabel, danger, resolve });
      }),
    []
  );

  function resolveDialog(result) {
    dialog?.resolve(result);
    setDialog(null);
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts: centrados arriba */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>

      {dialog && <ConfirmDialog dialog={dialog} onResolve={resolveDialog} />}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback debe usarse dentro de <FeedbackProvider>');
  return ctx;
}
