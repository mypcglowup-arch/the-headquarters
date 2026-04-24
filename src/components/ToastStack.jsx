/**
 * ToastStack — fixed position stack of toast notifications.
 * Sits above GlobalFloatingInput (z-index: 50) at z-index: 200.
 * Positioned bottom-center, above the floating input bar.
 */

const TYPE_CONFIG = {
  success: {
    bg:     'rgba(16, 185, 129, 0.10)',
    border: 'rgba(16, 185, 129, 0.22)',
    icon:   '✓',
    color:  'rgb(52, 211, 153)',
  },
  error: {
    bg:     'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.22)',
    icon:   '✕',
    color:  'rgb(252, 165, 165)',
  },
  info: {
    bg:     'rgba(99, 102, 241, 0.10)',
    border: 'rgba(99, 102, 241, 0.22)',
    icon:   'ℹ',
    color:  'rgb(165, 180, 252)',
  },
  warning: {
    bg:     'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.22)',
    icon:   '!',
    color:  'rgb(252, 211, 77)',
  },
};

export default function ToastStack({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 104,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 200,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => {
        const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.info;
        return (
          <div
            key={t.id}
            className={t.dying ? 'animate-toast-out' : 'animate-toast-in'}
            onClick={() => onDismiss?.(t.id)}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 16px 7px 12px',
              borderRadius: 24,
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: 'rgba(226, 232, 240, 0.92)',
              fontSize: 13,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 500,
              letterSpacing: '0.01em',
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(0,0,0,0.28)',
              whiteSpace: 'nowrap',
              maxWidth: 360,
              userSelect: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: `${cfg.border}`,
                color: cfg.color,
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {cfg.icon}
            </span>
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
