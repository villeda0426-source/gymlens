/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#E8FF47",
        dark: "#0A0A0A",
        surface: "#141414",
        border: "#2A2A2A",
        textPrimary: "#F5F5F5",
        muted: "#888888",
        danger: "#FF4747",
        success: "#47FF8E",
      },
      fontFamily: {
        display: ["BarlowCondensed_700Bold"],
        body: ["DMSans_400Regular"],
        "body-medium": ["DMSans_500Medium"],
        "body-bold": ["DMSans_700Bold"],
        mono: ["SpaceMono_400Regular"],
      },
    },
  },
  plugins: [],
};
