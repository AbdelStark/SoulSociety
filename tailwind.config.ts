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
          'nostr-purple': '#9D4EDD',
          'nostr-purple-hover': '#B06beb',
          'valid-green': '#00E055',
          'paper': '#FDFBF7',
          'zk-blue-light': '#E0E7FF',
        }
      },
    },
    plugins: [],
  }