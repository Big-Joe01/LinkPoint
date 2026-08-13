/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0D77F8', 50: '#EAF3FE', 600: '#0A63D1', 700: '#084FA8' },
        ink: { DEFAULT: '#0A1120', soft: '#1B2438' },
      },
    },
  },
  plugins: [],
};
