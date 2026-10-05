import type { ReactNode } from 'react';

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ToStartIcon = () => (
  <Icon>
    <path d="M6 5h2v14H6zM20 5v14l-10-7z" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 5v14l12-7z" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </Icon>
);

export const ForwardIcon = () => (
  <Icon>
    <path d="M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6z" />
  </Icon>
);

export const ToEndIcon = () => (
  <Icon>
    <path d="M16 5h2v14h-2zM4 5v14l10-7z" />
  </Icon>
);
