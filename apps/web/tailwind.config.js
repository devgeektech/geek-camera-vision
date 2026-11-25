/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2430",
        mist: "#f3f5f7",
        line: "#d9e0e7",
        teal: "#0f766e",
      },
    },
  },
  plugins: [],
};
