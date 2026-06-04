import { useToastStore } from '../../store/toastStore'
import type { ToastType } from '../../types'
import './Toaster.css'

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="toast-container" role="region" aria-label="Notificações">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type} animate-fade-in`}
          onClick={() => removeToast(toast.id)}
        >
          <span className="toast-icon">{ICONS[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
