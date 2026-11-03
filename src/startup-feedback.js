import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

/** Explain finite non-visibility without claiming hidden content was rendered or loaded. */
export function startupVisibilityText(row, t) {
  if (row.stage === 'session-list' && row.reason === 'sidebar-collapsed') return t('visibilityListCollapsed')
  if (row.stage === 'session-content' && row.reason === 'initial-main-panel') return t('visibilityInitialPanel')
  return t('visibilityOther', { surface: t(row.stage === 'session-list' ? 'visibilityList' : 'visibilityContent'), reason: row.reason })
}

export const startupFeedbackCss = `
.dsh-startup-feedback{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:900;box-sizing:border-box;width:min(328px,calc(100vw - 32px));display:grid;gap:10px;padding:14px 16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);box-shadow:var(--dsw-shadow-lv3);font-size:13px;line-height:1.6;animation:dsh-startup-enter 180ms ease-out;pointer-events:none}
.dsh-startup-feedback-header{display:flex;gap:12px;align-items:baseline;justify-content:space-between;font-weight:500}.dsh-startup-feedback-time{font-variant-numeric:tabular-nums;white-space:nowrap}.dsh-startup-feedback-copy{margin:0;overflow-wrap:anywhere}.dsh-startup-feedback-steps{display:flex;gap:6px}.dsh-startup-feedback-step{height:3px;flex:1;border-radius:var(--dsw-radius-lg);background:currentColor;opacity:.2}.dsh-startup-feedback-step[data-ready=true]{opacity:1}.dsh-startup-feedback-step[data-current=true]{animation:dsh-startup-pulse 1.4s ease-in-out infinite}.dsh-startup-feedback-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsh-startup-feedback-footer button{pointer-events:auto;color:inherit}
@keyframes dsh-startup-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes dsh-startup-pulse{50%{opacity:.6}}
@media(prefers-reduced-motion:reduce){.dsh-startup-feedback,.dsh-startup-feedback-step[data-current=true]{animation:none}}
`

/** Non-blocking progress uses the collector's exact completion point; only dismissal counts down. */
export function StartupFeedback({ collector, now, t }) {
  const status = React.useSyncExternalStore(collector.subscribe, collector.getSnapshot)
  const [time, setTime] = React.useState(now), [dismissed, dismiss] = React.useState(false)
  React.useEffect(() => {
    if (dismissed) return
    const timer = setInterval(() => {
      const value = now()
      setTime(value)
      if (status.completedAt !== undefined && value >= status.completedAt + 3000) dismiss(true)
    }, 250)
    return () => clearInterval(timer)
  }, [dismissed, now, status.completedAt])
  const complete = status.completedAt !== undefined
  const visibility = status.visibility ?? []
  const remaining = complete ? Math.max(0, Math.ceil((status.completedAt + 3000 - Math.max(time, status.completedAt)) / 1000)) : undefined
  if (dismissed || remaining === 0) return null
  const h = React.createElement
  return createPortal(h('aside', { className: 'dsh-startup-feedback', 'data-startup-feedback': status.phase, 'aria-label': t('feedbackTitle') },
    h('div', { className: 'dsh-startup-feedback-header' }, h('span', null, t(complete ? visibility.length ? 'visibleComplete' : 'feedbackComplete' : 'feedbackTitle')),
      h('span', { className: 'dsh-startup-feedback-time', 'aria-hidden': true }, t('feedbackElapsed', { value: ((status.completedAt ?? time) / 1000).toFixed(1) }))),
    h('p', { role: 'status', 'aria-live': 'polite', className: 'dsh-startup-feedback-copy' }, t(complete && visibility.length ? 'feedbackCompleteLimited' : 'feedback_' + status.phase)),
    ...visibility.map(row => h('p', { key: row.stage, className: 'dsh-startup-feedback-copy', 'data-startup-visibility': row.stage }, startupVisibilityText(row, t))),
    h('div', { className: 'dsh-startup-feedback-steps', 'aria-hidden': true }, ...[0, 1, 2, 3].map(index =>
      h('span', { key: index, className: 'dsh-startup-feedback-step', 'data-ready': index < status.steps, 'data-current': !complete && index === status.steps }))),
    h('div', { className: 'dsh-startup-feedback-footer' },
      h('span', null, complete ? t('feedbackClosing', { value: remaining }) : t('feedbackSteps', { value: status.steps })),
      h(Button, { onClick: () => dismiss(true), 'aria-label': t('feedbackHide') }, t('feedbackHide')))), document.body)
}
