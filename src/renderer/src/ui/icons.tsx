/*
 * ExploreFly by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square', strokeLinejoin: 'miter' } as const;

// The ExploreFly mark: two offset blocks
export const Logo = () => (
  <svg viewBox="150 188 1700 1654" aria-hidden="true">
    <rect x="842" y="188" width="1008" height="932" fill="currentColor" />
    <rect x="150" y="1120" width="692" height="722" fill="currentColor" />
  </svg>
);

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

export const IconLive = () => (
  <Icon>
    <rect x="3.5" y="4.5" width="17" height="12" {...stroke} />
    <path d="M8.5 20.5h7M12 16.5v4" {...stroke} />
    <rect x="10.5" y="9" width="3" height="3" fill="currentColor" />
  </Icon>
);

export const IconExplore = () => (
  <Icon>
    <rect x="4.5" y="4.5" width="15" height="15" {...stroke} />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" {...stroke} />
  </Icon>
);

export const IconData = () => (
  <Icon>
    <rect x="4" y="4" width="7" height="7" {...stroke} />
    <rect x="13" y="4" width="7" height="7" {...stroke} />
    <rect x="4" y="13" width="7" height="7" {...stroke} />
    <rect x="13" y="13" width="7" height="7" fill="currentColor" />
  </Icon>
);

export const IconSearch = () => (
  <Icon>
    <rect x="4.5" y="4.5" width="11" height="11" {...stroke} />
    <path d="M15.5 15.5l4.5 4.5" {...stroke} />
  </Icon>
);

export const IconGlobe = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" {...stroke} />
    <path d="M3.5 12h17M12 3.5v17M8 3.5v17M16 3.5v17" {...stroke} strokeWidth={1} />
  </Icon>
);

export const IconFile = () => (
  <Icon>
    <path d="M14 3.5H5.5v17h13V8z M14 3.5V8h4.5" {...stroke} />
    <path d="M12 17v-6M9.5 13.5L12 11l2.5 2.5" {...stroke} />
  </Icon>
);

export const IconBack = () => (
  <Icon><path d="M14.5 6l-6 6 6 6" {...stroke} /></Icon>
);

export const IconForward = () => (
  <Icon><path d="M9.5 6l6 6-6 6" {...stroke} /></Icon>
);

export const IconReload = () => (
  <Icon><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" {...stroke} /></Icon>
);

export const IconClose = () => (
  <Icon><path d="M6 6l12 12M18 6L6 18" {...stroke} /></Icon>
);

export const IconMore = () => (
  <Icon>
    <rect x="4" y="11" width="2.5" height="2.5" fill="currentColor" />
    <rect x="10.75" y="11" width="2.5" height="2.5" fill="currentColor" />
    <rect x="17.5" y="11" width="2.5" height="2.5" fill="currentColor" />
  </Icon>
);

export const IconGitHub = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);
