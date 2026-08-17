import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "schema-atlas-theme";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored === "light" ? "light" : "dark";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem(KEY, next);
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, setTheme, toggle };
}
