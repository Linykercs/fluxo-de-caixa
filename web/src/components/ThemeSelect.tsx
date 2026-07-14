import { useState } from "react";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";

/** Seletor de tema (auto/claro/escuro), persistido em localStorage. */
export function ThemeSelect({ id = "theme-select" }: { id?: string }) {
  const [pref, setPref] = useState<ThemePref>(getThemePref);

  function handleChange(next: ThemePref) {
    setThemePref(next);
    setPref(next);
  }

  return (
    <label className="theme-select">
      <span>Tema</span>
      <select id={id} value={pref} onChange={(e) => handleChange(e.target.value as ThemePref)}>
        <option value="auto">Automático</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
    </label>
  );
}
