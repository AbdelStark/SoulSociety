/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
          mono: ['JetBrains Mono', 'monospace'],
        },
        colors: {
          'stark-orange': '#FF5C00',
          'stark-orange-hover': '#FF7A2E',
          'stark-orange-dark': '#CC4A00',
          'nostr-purple': '#9D4EDD',
          'nostr-purple-hover': '#B06beb',
          'valid-green': '#00E055',
          'paper': '#FDFBF7',
          'zk-blue-light': '#E0E7FF',
          'bitcoin-gold': '#F7931A',
        },
        borderWidth: {
          '3': '3px',
        },
        backgroundImage: {
          'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='rgba(0,0,0,0.1)' stroke-width='1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23grid)' /%3E%3C/svg%3E\")",
        }
      },
    },
    plugins: [],
  }