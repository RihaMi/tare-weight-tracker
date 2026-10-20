// Apply a theme chosen in the app before the page paints, to avoid a flash of the other theme.
// A file of its own, not inline, so the security policy can forbid inline scripts.
try { var t = localStorage.getItem('tare.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
