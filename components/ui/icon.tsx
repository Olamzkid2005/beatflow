import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "arrowRight"
  | "bolt"
  | "calendar"
  | "check"
  | "chevronDown"
  | "clock"
  | "close"
  | "copy"
  | "disc"
  | "download"
  | "external"
  | "file"
  | "folder"
  | "history"
  | "image"
  | "info"
  | "link"
  | "logout"
  | "movie"
  | "music"
  | "pause"
  | "play"
  | "plus"
  | "radio"
  | "refresh"
  | "search"
  | "settings"
  | "shield"
  | "spark"
  | "studio"
  | "trash"
  | "tune"
  | "upload"
  | "user"
  | "wave"
  | "youtube";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
};

const stroked: Partial<Record<IconName, React.ReactNode>> = {
  alert: (
    <>
      <path d="M12 4 3.8 19h16.4L12 4Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  bolt: <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-8.5 8.5" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
  ),
  history: (
    <>
      <path d="M4 5v5h5" />
      <path d="M5.2 9.5A8 8 0 1 1 4 12" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4.5 17 5-5 4 4 2.5-2.5 3.5 3.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4M9 12h9" />
    </>
  ),
  movie: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M8 4.5v15M16 4.5v15M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  radio: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9" />
      <path d="M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 5v5h-5" />
      <path d="M18.5 9.5A7.5 7.5 0 1 0 19 16" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h7M15 7h5M4 17h3M11 17h9" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </>
  ),
  studio: <path d="M3.5 14v-4M7.5 17V7M11.5 20V4M15.5 16V8M19.5 13v-2" />,
  trash: (
    <>
      <path d="M4 7h16M9 4h6M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  tune: (
    <>
      <path d="M4 7h9M17 7h3M4 17h4M12 17h8" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 19h16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  wave: <path d="M3 12c2.5-6 5-6 7.5 0s5 6 7.5 0M17.5 12H21" />,
};

const filled: Partial<Record<IconName, React.ReactNode>> = {
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: <path d="M8 5h3v14H8zM14 5h3v14h-3z" />,
  youtube: (
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8ZM9.5 15.6V8.4L15.8 12l-6.3 3.6Z" />
  ),
};

export function Icon({ name, className = "h-4 w-4", ...props }: IconProps) {
  const isFilled = name in filled;
  return (
    <svg
      viewBox="0 0 24 24"
      fill={isFilled ? "currentColor" : "none"}
      stroke={isFilled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {isFilled ? filled[name] : stroked[name]}
    </svg>
  );
}
