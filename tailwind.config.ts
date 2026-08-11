import type { Config } from "tailwindcss";

// Palette: this is a *private table*, not a public feed — so we lean into
// a quiet, dim-lit "dinner table" feel rather than a bright, ad-friendly one.
// Base: warm charcoal. Accent: a single deep bay-leaf green (herb, not ketchup-red).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        table: {
          950: "#15130f", // near-black, warm not cold
          900: "#1e1b16",
          800: "#2a2620",
          700: "#3a352c",
          600: "#524b3d",
          400: "#8a8170",
          200: "#d8d2c2",
          100: "#efebe0",
          50: "#f8f6ef",
        },
        herb: {
          600: "#4c5c3f",
          500: "#5f7350",
          400: "#7c9269",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
