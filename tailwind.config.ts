import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        asphalt: "#1f2937",
        milestone: "#0f766e",
        caution: "#f59e0b",
        petrol: "#0369a1",
        service: "#7c3aed",
      },
      boxShadow: {
        soft: "0 16px 40px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
