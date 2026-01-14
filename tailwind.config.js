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
        brand: ['"Source Serif 4"', "ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"],
        pragmata: ['"Pragmata Pro"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        mono: ['"Pragmata Pro"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      screens: {
        xs: "360px",
        sm: "480px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
        "3xl": "1920px",
        "4xl": "2560px",
      },
    },
  },
  plugins: [],
};









