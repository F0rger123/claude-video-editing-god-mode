/** Minimal stroke icon set (24px grid, 1.6 stroke). Inline so nothing loads from a CDN. */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z",
  plus: "M12 5v14M5 12h14",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  clients: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  back: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6 6 18",
  play: "M8 5v14l11-7z",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  upload: "M12 16V4M6 10l6-6 6 6M4 20h16",
  film: "M4 4h16v16H4zM4 8h3M4 12h3M4 16h3M17 8h3M17 12h3M17 16h3M7 4v16M17 4v16",
  image: "M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5",
  note: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  alert: "M12 3 2 20h20zM12 10v4M12 17v.5",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  chevron: "M9 6l6 6-6 6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
  phone: "M7 2h10v20H7zM11 18h2",
  fingerprint: "M7.5 4.2A9 9 0 0 1 21 12v1M3 12a9 9 0 0 1 1.6-5.1M6 19.4A9 9 0 0 1 5 12a7 7 0 0 1 11.5-5.4M19 13v1a14 14 0 0 1-1.2 5.6M9 20.6A10 10 0 0 0 9.5 12a2.5 2.5 0 0 1 5 0v1a17 17 0 0 1-2 8M12 12v1a20 20 0 0 1-2.3 9.3M15.6 21.2c.5-1.4.9-3 .9-4.7",
  key: "M8 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10.9 12.1 20 3M16 7l3 3M18.5 4.5l2 2",
  send: "M4 12 20 4l-6 16-3-7zM11 13l9-9",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  heart: "M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 9 2.4C21 15 12 20.5 12 20.5z",
  star: "M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  swipe: "M4 7h11M11 3l4 4-4 4M20 17H9M13 13l-4 4 4 4",
  sdcard: "M8 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.5zM10 3v4M13 3v4M16 3v4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5", title, filled = false, stroke = 1.6 }: { name: IconName; className?: string; title?: string; filled?: boolean; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
