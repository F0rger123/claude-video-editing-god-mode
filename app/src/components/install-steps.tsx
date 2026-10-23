import { APP_SHORT_NAME, SITE_HOST } from "@/lib/brand";
/**
 * Drawn step illustrations for "Add to Home Screen" (iPhone Safari and Android Chrome).
 * They are diagrams, not screenshots, so they stay correct in light or dark mode and need no image files.
 */

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 220 420" role="img" aria-label={label} className="h-auto w-full">
      <rect x="6" y="6" width="208" height="408" rx="34" fill="#0d0d0d" stroke="#3a3a3a" strokeWidth="3" />
      <rect x="80" y="18" width="60" height="16" rx="8" fill="#000" />
      <rect x="18" y="42" width="184" height="360" rx="10" fill="#f4f4f2" />
      {children}
    </svg>
  );
}

const Finger = ({ x, y }: { x: number; y: number }) => (
  <g>
    <circle cx={x} cy={y} r="17" fill="none" stroke="#e8b54a" strokeWidth="3" />
    <circle cx={x} cy={y} r="6" fill="#e8b54a" />
  </g>
);

const PageLines = () => (
  <g fill="#cfcfcf">
    <rect x="34" y="70" width="120" height="14" rx="4" fill="#111" />
    <rect x="34" y="96" width="150" height="8" rx="4" />
    <rect x="34" y="112" width="130" height="8" rx="4" />
    <rect x="34" y="136" width="150" height="90" rx="8" />
    <rect x="34" y="238" width="140" height="8" rx="4" />
  </g>
);

const ShareIcon = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x - 9} ${y - 12})`} fill="none" stroke="#0a84ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 1v14M4 6l5-5 5 5" />
    <path d="M3 10H1v13h16V10h-2" />
  </g>
);

export function IosStep1() {
  return (
    <Phone label="Safari with the Share button at the bottom highlighted">
      <PageLines />
      <rect x="18" y="352" width="184" height="50" fill="#e9e9e7" />
      <rect x="40" y="326" width="140" height="20" rx="10" fill="#dcdcda" />
      <text x="110" y="340" textAnchor="middle" fontSize="9" fill="#555">{SITE_HOST}</text>
      <g fill="none" stroke="#0a84ff" strokeWidth="2.4" strokeLinecap="round">
        <path d="M40 370l-6 6 6 6" />
        <path d="M66 370l6 6-6 6" />
        <path d="M150 368h12v14h-12zM154 368v-3h12v14h-3" />
        <path d="M184 368h10M184 374h10M184 380h10" />
      </g>
      <ShareIcon x={110} y={378} />
      <Finger x={110} y={376} />
    </Phone>
  );
}

export function IosStep2() {
  return (
    <Phone label="Share sheet with Add to Home Screen highlighted">
      <PageLines />
      <rect x="18" y="160" width="184" height="242" rx="14" fill="#ececea" />
      <rect x="96" y="168" width="28" height="4" rx="2" fill="#b5b5b5" />
      {["Copy", "Add to Reading List", "Add Bookmark", "Add to Home Screen", "Markup"].map((t, i) => (
        <g key={t}>
          <rect x="30" y={186 + i * 40} width="160" height="32" rx="8" fill={t === "Add to Home Screen" ? "#ffffff" : "#f7f7f5"} stroke={t === "Add to Home Screen" ? "#e8b54a" : "none"} strokeWidth="2" />
          <text x="42" y={206 + i * 40} fontSize="10.5" fill="#111">{t}</text>
          {t === "Add to Home Screen" ? <path d={`M171 ${195 + i * 40}h12v14h-12zM177 ${198 + i * 40}v8M173 ${202 + i * 40}h8`} fill="none" stroke="#111" strokeWidth="1.6" /> : null}
        </g>
      ))}
      <Finger x={150} y={322} />
    </Phone>
  );
}

export function IosStep3() {
  return (
    <Phone label="Add to Home Screen screen with the Add button highlighted">
      <rect x="18" y="42" width="184" height="40" fill="#ececea" />
      <text x="34" y="66" fontSize="10.5" fill="#0a84ff">Cancel</text>
      <text x="110" y="66" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#111">Add to Home Screen</text>
      <text x="186" y="66" textAnchor="end" fontSize="11" fontWeight="700" fill="#0a84ff">Add</text>
      <rect x="34" y="100" width="44" height="44" rx="10" fill="#7c3aed" />
      <path d="M50 112l16 10-16 10z" fill="#fff" />
      <text x="90" y="118" fontSize="11" fill="#111">{APP_SHORT_NAME}</text>
      <text x="90" y="134" fontSize="8.5" fill="#888">{SITE_HOST}</text>
      <Finger x={178} y={62} />
    </Phone>
  );
}

export function IosStep4() {
  return (
    <Phone label={`Home screen with the ${APP_SHORT_NAME} icon`}>
      <rect x="18" y="42" width="184" height="360" rx="10" fill="#2b2b2b" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={36 + (i % 4) * 42} y={70 + Math.floor(i / 4) * 54} width="30" height="30" rx="8" fill="#555" />
      ))}
      <g transform="translate(36 232)">
        <rect width="30" height="30" rx="8" fill="#7c3aed" stroke="#e8b54a" strokeWidth="2" />
        <path d="M11 8l11 7-11 7z" fill="#fff" />
        <text x="15" y="44" textAnchor="middle" fontSize="7" fill="#fff">{APP_SHORT_NAME}</text>
      </g>
      <Finger x={51} y={247} />
    </Phone>
  );
}

export function AndroidStep1() {
  return (
    <Phone label="Chrome with the three-dot menu highlighted">
      <rect x="18" y="42" width="184" height="34" fill="#e9e9e7" />
      <rect x="28" y="50" width="140" height="18" rx="9" fill="#dcdcda" />
      <g fill="#333">
        <circle cx="186" cy="53" r="2" />
        <circle cx="186" cy="59" r="2" />
        <circle cx="186" cy="65" r="2" />
      </g>
      <g transform="translate(0 20)"><PageLines /></g>
      <Finger x={186} y={59} />
    </Phone>
  );
}

export function AndroidStep2() {
  return (
    <Phone label="Chrome menu with Install app highlighted">
      <g transform="translate(0 20)"><PageLines /></g>
      <rect x="86" y="48" width="112" height="190" rx="8" fill="#ffffff" stroke="#d4d4d4" />
      {["New tab", "Bookmarks", "History", "Install app", "Settings"].map((t, i) => (
        <g key={t}>
          {t === "Install app" ? <rect x="90" y={58 + i * 34} width="104" height="28" rx="6" fill="#fff" stroke="#e8b54a" strokeWidth="2" /> : null}
          <text x="100" y={76 + i * 34} fontSize="10.5" fill="#111">{t}</text>
        </g>
      ))}
      <Finger x={170} y={172} />
    </Phone>
  );
}
