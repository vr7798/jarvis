const STORAGE_KEY = 'jarvis.terminal.v1';
const DEFAULTS = { theme: 'obsidian', fontSize: 14 };

/** Each palette includes all 16 ANSI colors so full-screen CLI tools match the chrome. */
export const TERMINAL_THEMES = {
  obsidian: {
    id: 'obsidian', name: 'Obsidian', description: 'Grafite profundo · azul elétrico',
    accent: '#8bb9ff', chrome: '#151a23', border: '#283343', muted: '#929fb5',
    theme: {
      background: '#0d1119', foreground: '#dce5f3', cursor: '#8bb9ff', cursorAccent: '#0d1119',
      selectionBackground: '#8bb9ff3d', selectionInactiveBackground: '#8bb9ff26',
      black: '#202938', red: '#f27f8d', green: '#95d6a4', yellow: '#e7c787',
      blue: '#8bb9ff', magenta: '#c7a5ef', cyan: '#81d5df', white: '#c9d4e4',
      brightBlack: '#69788e', brightRed: '#ffabb3', brightGreen: '#b6edc2', brightYellow: '#f8dfac',
      brightBlue: '#b0d0ff', brightMagenta: '#dfc3ff', brightCyan: '#b0edf1', brightWhite: '#f4f7fc',
    },
  },
  termux: {
    id: 'termux', name: 'Termux', description: 'Preto clássico · fósforo verde',
    accent: '#a4e7a1', chrome: '#111711', border: '#29372b', muted: '#90a792',
    theme: {
      background: '#080c09', foreground: '#d3e8d2', cursor: '#a4e7a1', cursorAccent: '#080c09',
      selectionBackground: '#8ccc873d', selectionInactiveBackground: '#8ccc8726',
      black: '#19231a', red: '#ec8985', green: '#a4e7a1', yellow: '#ded394',
      blue: '#91b8e3', magenta: '#c9a2d6', cyan: '#8bd2c5', white: '#cadcc8',
      brightBlack: '#6f846e', brightRed: '#ffb0a9', brightGreen: '#c5fac2', brightYellow: '#f2e9b4',
      brightBlue: '#b7d8ff', brightMagenta: '#e4bfee', brightCyan: '#b0efe2', brightWhite: '#f0f9ed',
    },
  },
  dracula: {
    id: 'dracula', name: 'Dracula', description: 'Roxo intenso · cores vibrantes',
    accent: '#bd93f9', chrome: '#282a3b', border: '#44475a', muted: '#a5a4c0',
    theme: {
      background: '#1e1f2d', foreground: '#f8f8f2', cursor: '#bd93f9', cursorAccent: '#1e1f2d',
      selectionBackground: '#bd93f940', selectionInactiveBackground: '#bd93f928',
      black: '#282a36', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#9dacf8', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#737baf', brightRed: '#ff8888', brightGreen: '#8affaa', brightYellow: '#ffffb5',
      brightBlue: '#bdc8ff', brightMagenta: '#ffabe0', brightCyan: '#b6f3ff', brightWhite: '#ffffff',
    },
  },
  tokyo: {
    id: 'tokyo', name: 'Tokyo Night', description: 'Azul noturno · neon suave',
    accent: '#7aa2f7', chrome: '#1f2335', border: '#343b58', muted: '#9aa5ce',
    theme: {
      background: '#171b2b', foreground: '#c0caf5', cursor: '#7aa2f7', cursorAccent: '#171b2b',
      selectionBackground: '#7aa2f740', selectionInactiveBackground: '#7aa2f728',
      black: '#20253a', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#6978a9', brightRed: '#ffa2b5', brightGreen: '#bfe48e', brightYellow: '#f5cf91',
      brightBlue: '#a4c1ff', brightMagenta: '#d7baff', brightCyan: '#ade3ff', brightWhite: '#e3e9ff',
    },
  },
  daylight: {
    id: 'daylight', name: 'Daylight', description: 'Claro preciso · alto contraste',
    accent: '#315cc7', chrome: '#f2f5fb', border: '#d1d9e8', muted: '#596983',
    theme: {
      background: '#fbfcff', foreground: '#25334a', cursor: '#315cc7', cursorAccent: '#fbfcff',
      selectionBackground: '#315cc730', selectionInactiveBackground: '#315cc71c',
      black: '#25334a', red: '#b62d48', green: '#277243', yellow: '#856114',
      blue: '#315cc7', magenta: '#7941af', cyan: '#146d81', white: '#56647c',
      brightBlack: '#6a7790', brightRed: '#c82b45', brightGreen: '#18733b', brightYellow: '#96620c',
      brightBlue: '#2857c9', brightMagenta: '#8d37b2', brightCyan: '#08758b', brightWhite: '#1b2941',
    },
  },
};

function sanitize(value) {
  return {
    theme: value && Object.hasOwn(TERMINAL_THEMES, value.theme) ? value.theme : DEFAULTS.theme,
    fontSize: Number.isInteger(value?.fontSize) ? Math.max(11, Math.min(22, value.fontSize)) : DEFAULTS.fontSize,
  };
}

export function loadTerminalPreferences() {
  try { return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return { ...DEFAULTS }; }
}

export function saveTerminalPreferences(value) {
  const preferences = sanitize(value);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {}
  return preferences;
}
