import { app } from '../app';
import { loadData } from '../data/storage';

// Keeps several open Tare windows (tabs, or the installed app next to a tab)
// in step. Each window holds its own copy of the data, so without this the
// window that saves last would silently undo changes made in another one.
// After every save a window announces it; the others reload from storage.

const tabId = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;

export function initTabSync(onExternalChange: () => void): void {
  if (!('BroadcastChannel' in window)) return;
  channel = new BroadcastChannel('tare-sync');
  channel.onmessage = async ev => {
    if (ev.data?.type !== 'saved' || ev.data.from === tabId) return;
    const { data } = await loadData(app.store);
    if (!data) return;
    app.data = data;
    onExternalChange();
  };
}

/** Tells other open windows that the saved data changed. */
export function announceSaved(): void {
  channel?.postMessage({ type: 'saved', from: tabId });
}
