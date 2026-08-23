import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

type BaseIconProps = IconProps & {
  children: ReactNode;
};

function BaseIcon({ className, children }: BaseIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M16 10H4.5m4.25-4.25L4.5 10l4.25 4.25" />
    </BaseIcon>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 13V3.75m-3.5 3.5L10 3.75l3.5 3.5" />
      <path d="M4 11.5v3A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </BaseIcon>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 6.25A3.25 3.25 0 0 0 6.75 3H3.5v12h3.25A3.25 3.25 0 0 1 10 18.25v-12Z" />
      <path d="M10 6.25A3.25 3.25 0 0 1 13.25 3h3.25v12h-3.25A3.25 3.25 0 0 0 10 18.25v-12Z" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m4 10.25 3.75 3.75L16 5.75" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m5.25 7.75 4.75 4.5 4.75-4.5" />
    </BaseIcon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M11.5 3.5h5v5m0-5-7 7" />
      <path d="M16 11.5V15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 15V6a1.5 1.5 0 0 1 1.5-1.5H9" />
    </BaseIcon>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 15 16H5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
      <path d="M3.5 12h3l1.25 2h4.5l1.25-2h3" />
    </BaseIcon>
  );
}

export function MoreVerticalIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15.5" r="1.25" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 4v12M4 10h12" />
    </BaseIcon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 5h12M4 10h12M4 15h12" />
      <circle cx="7" cy="5" r="1.5" fill="var(--toggle-bg)" />
      <circle cx="13" cy="10" r="1.5" fill="var(--toggle-bg)" />
      <circle cx="8.5" cy="15" r="1.5" fill="var(--toggle-bg)" />
    </BaseIcon>
  );
}

export function SoundIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 4.5 5.75 7.25H3.5v5.5h2.25L9 15.5v-11Z" />
      <path className="sound-toggle__enabled" d="M12.25 7.25a4 4 0 0 1 0 5.5m2.25-7.5a6.75 6.75 0 0 1 0 9.5" />
      <path className="sound-toggle__muted" d="m12.5 7.5 4.5 5m0-5-4.5 5" />
    </BaseIcon>
  );
}

export function ThemeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle className="theme-toggle__sun" cx="10" cy="10" r="3" />
      <path
        className="theme-toggle__sun"
        d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2m13.66-5.66-1.07 1.07M5.41 14.59l-1.07 1.07m11.32 0-1.07-1.07M5.41 5.41 4.34 4.34"
      />
      <path className="theme-toggle__moon" d="M16.75 12.25A6.75 6.75 0 0 1 7.75 3.25a7.25 7.25 0 1 0 9 9Z" />
    </BaseIcon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M4.5 17a5.5 5.5 0 0 1 11 0" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3.5 5.5h13M7.25 5.5V3.75h5.5V5.5M5.5 5.5l.75 11h7.5l.75-11" />
      <path d="M8.25 9v4M11.75 9v4" />
    </BaseIcon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </BaseIcon>
  );
}
