/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Pro Text"', '"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        studio: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          primary: '#2563eb',
          accent: '#7c3aed'
        },
        host: {
          canvas: 'var(--host-canvas)',
          chrome: 'var(--host-chrome)',
          elevated: 'var(--host-elevated)',
          dialog: 'var(--host-dialog)',
          sunken: 'var(--host-sunken)',
          accent: 'var(--host-accent)',
          'accent-hover': 'var(--host-accent-hover)',
          'accent-subtle': 'var(--host-accent-subtle)',
          primary: 'var(--host-text-primary)',
          secondary: 'var(--host-text-secondary)',
          tertiary: 'var(--host-text-tertiary)',
          'on-accent': 'var(--host-text-on-accent)',
          brand: 'var(--host-text-brand)',
          success: 'var(--host-text-success)',
          warning: 'var(--host-text-warning)',
          danger: 'var(--host-text-danger)',
          border: 'var(--host-border)',
          'border-strong': 'var(--host-border-strong)',
        }
      }
    },
  },
  plugins: [],
}
