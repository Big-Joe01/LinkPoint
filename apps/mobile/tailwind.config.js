/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0D77F8',
          50: '#EAF3FE',
          100: '#D1E4FD',
          500: '#0D77F8',
          600: '#0A63D1',
          700: '#084FA8',
          900: '#042A5C',
        },
        ink: {
          DEFAULT: '#0A1120',
          soft: '#1B2438',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
