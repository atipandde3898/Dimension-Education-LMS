import { useEffect, useState } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'de_theme';

export function getStoredThemeSetting(): ThemeSetting {
  if (typeof window === 'undefined') return 'system';
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'system') {
      return val;
    }
  } catch {
    // ignore local storage access issues
  }
  return 'system';
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(setting: ThemeSetting): 'light' | 'dark' {
  const resolved = setting === 'system' ? getSystemTheme() : setting;
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }
  return resolved;
}

export function setStoredThemeSetting(setting: ThemeSetting): 'light' | 'dark' {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, setting);
  } catch {
    // ignore
  }
  return applyTheme(setting);
}

export function useTheme() {
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>(getStoredThemeSetting);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const current = getStoredThemeSetting();
    return current === 'system' ? getSystemTheme() : current;
  });

  useEffect(() => {
    const resolved = applyTheme(themeSetting);
    setResolvedTheme(resolved);

    if (themeSetting === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        const next = e.matches ? 'dark' : 'light';
        applyTheme('system');
        setResolvedTheme(next);
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [themeSetting]);

  const setTheme = (next: ThemeSetting) => {
    setThemeSettingState(next);
    const resolved = setStoredThemeSetting(next);
    setResolvedTheme(resolved);
  };

  return { themeSetting, resolvedTheme, setTheme };
}
