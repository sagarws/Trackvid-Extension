/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fafb",
          100: "#d9f2f4",
          200: "#b0e4ea",
          300: "#86cfd1",
          400: "#4bb0b8",
          500: "#0088a3",
          600: "#00738a",
          700: "#005f72",
          800: "#0a4a5a",
          900: "#0a3844",
          950: "#062430",
        },
        ink: {
          900: "#0f1222",
          800: "#1a1d33",
          700: "#242742",
          500: "#5b5f7a",
          400: "#8a8ea8",
          300: "#b4b7cc",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 12px 40px -12px rgba(0, 136, 163, 0.25)",
        soft: "0 8px 24px -8px rgba(15, 18, 34, 0.15)",
      },
      keyframes: {
        "progress-slide": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "80%,100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "progress-slide": "progress-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "fade-in": "fade-in 0.35s ease-out both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-down": "slide-down 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
