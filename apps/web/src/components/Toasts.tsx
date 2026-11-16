import { AnimatePresence, motion } from 'framer-motion';
import { Mail, X } from 'lucide-react';
import { useApp } from '../lib/store';

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.tone ?? 'info'}`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {t.tone === 'mail' && (
              <span className="toast-icon">
                <Mail size={18} />
              </span>
            )}
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.body && <p>{t.body}</p>}
              {t.action && (
                <button
                  className="link"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Cerrar">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
