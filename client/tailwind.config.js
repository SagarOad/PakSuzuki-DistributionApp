/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        suzuki: {
          red: '#E30613',
          navy: '#003A70',
          blue: '#005BAC',
          sky: '#7EB6E8',
          ice: '#D6EAF8',
          ink: '#1A2B4A',
          mist: '#EEF2F6',
          line: '#E2E8F0',
          ok: '#22A06B',
          warn: '#C9372C',
          mute: '#64748B'
        },
        navy: {
          950: '#0a1128', 900: '#0f1b3d', 800: '#152552', 700: '#1c3170',
          600: '#274191', 500: '#3453b3', 100: '#e4e9f7'
        },
        accent: { DEFAULT: '#E30613', dark: '#B8050F', light: '#FF4D57' }
      },
      fontFamily: {
        sans: ['"Manrope"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Manrope"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 27, 61, 0.04), 0 8px 24px rgba(15, 27, 61, 0.06)'
      }
    }
  },
  plugins: []
}
