export type Lang = "en" | "fr";
// A new key: the old one (adam.lang) was rewritten at every start, so an "en" there may only be the old default.
export const LANG_KEY = "adam.language";

/** French unless the creator chose English. */
export const initialLang = (stored: string | null): Lang => (stored === "en" ? "en" : "fr");
