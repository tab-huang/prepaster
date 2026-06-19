// Minimal inline SVG icon set (Phosphor-ish, consistent 1.75 stroke). No emojis,
// no icon-font dependency. `name` selects the glyph; size + color inherit.

const PATHS = {
  // hazards
  flood: (
    <>
      <path d="M3 14c2 0 2-1.5 4-1.5S9 14 11 14s2-1.5 4-1.5S17 14 19 14" />
      <path d="M3 18c2 0 2-1.5 4-1.5S9 18 11 18s2-1.5 4-1.5S17 18 19 18" />
      <path d="M3 10c2 0 2-1.5 4-1.5S9 10 11 10s2-1.5 4-1.5S17 10 19 10" />
    </>
  ),
  wildfire: (
    <path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 0-1.5-.3-2 1.8 1 3.3 3 3.3 5.5a5 5 0 0 1-10 0C7 12 9.5 9 12 3Z" />
  ),
  tornado: (
    <>
      <path d="M4 5h16" />
      <path d="M6 9h12" />
      <path d="M8 13h7" />
      <path d="M10 17h3" />
      <path d="M11 20l1-3" />
    </>
  ),
  earthquake: (
    <path d="M2 12h4l2-5 3 9 3-12 3 11 2-3h3" />
  ),
  // ui
  pin: (
    <>
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  supplies: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M3 11h18M9 7V5h6v2" />
    </>
  ),
  shelter: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-4h4v4" />
    </>
  ),
  check: <path d="M5 12.5 10 17l9-10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
  beaker: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-3 4 4" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9a3 3 0 0 1 0 6" />
      <path d="M18.5 7a6 6 0 0 1 0 10" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = "", strokeWidth = 1.75 }) {
  const glyph = PATHS[name];
  if (!glyph) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
