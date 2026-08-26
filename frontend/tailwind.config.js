/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        ink: {
          950: "#0B1120",
          900: "#111827",
          800: "#1B2436",
          700: "#25324a",
        },
        vendor: {
          DEFAULT: "#D97706",
          light: "#FDE68A",
          soft: "#FFFBEB",
        },
        distributor: {
          DEFAULT: "#0D9488",
          light: "#99F6E4",
          soft: "#ECFDF5",
        },
        admin: {
          DEFAULT: "#6D28D9",
          light: "#DDD6FE",
          soft: "#F5F3FF",
        },
        client: {
          DEFAULT: "#0369A1",
          light: "#BAE6FD",
          soft: "#F0F9FF",
        },
        chain: {
          DEFAULT: "#7C3AED",
          glow: "#A78BFA",
        },
        alert: {
          high: "#DC2626",
          medium: "#D97706",
          low: "#2563EB",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.06)",
        glow: "0 0 0 1px rgba(124,58,237,0.15), 0 8px 24px rgba(124,58,237,0.18)",
      },
      backgroundImage: {
        "node-grid":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};
