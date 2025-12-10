/** @type {import('tailwindcss').Config} */
module.exports = {
  // or `export default { ... }` depending on your file
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        brand: ['"Riforma"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};










