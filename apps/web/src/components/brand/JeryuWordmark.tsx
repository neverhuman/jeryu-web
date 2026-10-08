import './JeryuWordmark.css';

/** Public-site brush lettering. The macron is part of the vector geometry. */
export function JeryuWordmark({
  variant = 'nav',
  decorative = false,
}: {
  variant?: 'nav' | 'hero';
  decorative?: boolean;
}): JSX.Element {
  return (
    <svg
      className={`jeryu-wordmark jeryu-wordmark--${variant}`}
      viewBox="0 0 620 190"
      fill="currentColor"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'JeRyū'}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <path d="M38 29 135 16 132 34 106 39 93 121C90 151 71 167 43 162 20 158 8 141 13 121L31 106 28 128C28 142 39 150 51 146 66 142 68 128 70 115L80 43 34 45Z" />
      <path fillRule="evenodd" d="M153 117C149 96 161 72 184 61 210 49 235 60 235 78 235 98 213 108 181 107 183 125 202 133 225 120L232 125C217 149 188 155 168 141 161 136 155 127 153 117ZM181 94C201 96 217 88 218 78 219 68 210 66 201 71 191 76 185 84 181 94Z" />
      <path fillRule="evenodd" d="M258 34 309 22C345 14 366 26 362 53 359 76 342 88 321 94L379 145 350 152 298 103 287 147 260 152 277 45 253 48ZM295 44 288 82C310 82 331 71 334 53 337 38 320 36 295 44Z" />
      <path d="M379 71 405 62 416 111 443 61 471 58 430 126C419 150 401 171 375 178L358 169C386 160 395 151 399 138L383 83Z" />
      <path d="M478 69 506 60 493 116C489 133 496 138 506 133 521 126 532 105 540 70L566 60 550 122C547 134 550 137 560 131L569 134C559 148 542 153 530 145 526 142 524 138 525 132 512 147 494 155 479 145 466 137 468 122 471 110Z" />
      <path d="M512 28 577 18 579 30 513 42 504 37Z" />
      <path d="M43 176C177 161 333 159 560 155L548 165C347 167 188 172 61 181Z" opacity=".55" />
    </svg>
  );
}
