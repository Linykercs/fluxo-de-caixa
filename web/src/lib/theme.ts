export type ThemePref = "auto" | "light" | "dark";

const STORAGE_KEY = "fluxo-theme";

export function getThemePref(): ThemePref {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

/** Aplica no <html>: auto remove o data-theme e deixa o sistema decidir. */
export function applyTheme(pref: ThemePref): void {
  if (pref === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

export function setThemePref(pref: ThemePref): void {
  if (pref === "auto") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, pref);
  }
  applyTheme(pref);
}
