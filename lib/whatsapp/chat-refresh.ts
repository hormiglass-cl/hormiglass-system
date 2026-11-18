/** How often an open opportunity re-reads the chat state while the page is visible. */
export const CHAT_REFRESH_MS = 15_000;

type VisibilityTarget = EventTarget & { hidden: boolean };

/**
 * Keeps an open view in step with ownership changes made elsewhere (the bot, ClickUp, the
 * 2-hour window, another seller). Calls `refresh` on an interval while the page is visible, and
 * once when the page becomes visible again or the window regains focus. Returns the cleanup.
 */
export function watchChatState(refresh: () => void, {
  doc = document as VisibilityTarget,
  win = window as EventTarget,
  intervalMs = CHAT_REFRESH_MS,
}: { doc?: VisibilityTarget; win?: EventTarget; intervalMs?: number } = {}): () => void {
  const timer = setInterval(() => { if (!doc.hidden) refresh(); }, intervalMs);
  const onVisibility = () => { if (!doc.hidden) refresh(); };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('focus', refresh);
  return () => {
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', refresh);
  };
}
