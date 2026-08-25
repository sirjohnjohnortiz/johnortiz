import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F2EA",
        card: "#FFFFFF",
        ink: "#16242D",
        inkmuted: "#5B6B72",
        border: "#DCD5C2",
        seal: "#B8863B",
        sealdark: "#8F6526",
        good: "#2F6F4F",
        warn: "#C97A2B",
        bad: "#B3432E",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plexmono)", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
