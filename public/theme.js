// Runs before the page paints, from a file of its own so the security policy can forbid inline scripts.

// Tare never runs inside another site's frame, where a hidden page could be clicked without
// you knowing (clickjacking). Some hosts (GitHub Pages) can't send a header to forbid that.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* blocked: it stays hidden */ }
}

// Apply a theme chosen in the app, to avoid a flash of the other theme.
try { var t = localStorage.getItem('tare.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
