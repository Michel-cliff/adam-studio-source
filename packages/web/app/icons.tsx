// The few line icons the interface uses, drawn to sit beside mono text.
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconHome = () => <svg {...base}><path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z" /></svg>;
export const IconGlobe = () => <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>;
export const IconFolder = () => <svg {...base}><path d="M3 7h6l2 2h10v10H3z" /></svg>;
export const IconEdit = () => <svg {...base}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 16l1-4 7-7 3 3-7 7z" /></svg>;
export const IconLink = () => <svg {...base}><path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1" /><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1" /></svg>;
export const IconBook = () => <svg {...base}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></svg>;
export const IconTrash = () => <svg {...base}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IconSend = () => <svg {...base} strokeWidth={2.4}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
