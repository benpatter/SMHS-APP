import type { SVGProps } from 'react';

/** Minimal stroke icon set. Currided so all share consistent sizing/stroke. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChartIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Icon>
);

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9 21v-6h6v6" />
  </Icon>
);

export const MegaphoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 11v2a1 1 0 0 0 1 1h2l9 4V6L6 10H4a1 1 0 0 0-1 1Z" />
    <path d="M18 8a4 4 0 0 1 0 8" />
    <path d="M7 14v3a2 2 0 0 0 4 0v-1" />
  </Icon>
);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="1.5" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </Icon>
);

export const GridIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
  </Icon>
);

export const UtensilsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 3v6a2 2 0 0 1-2 2 2 2 0 0 1-2-2V3" />
    <path d="M5 11v10" />
    <path d="M17 3c-1.7 0-3 2-3 5 0 2.2 1.3 4 3 4s3-1.8 3-4c0-3-1.3-5-3-5Z" />
    <path d="M17 12v9" />
  </Icon>
);

export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 5.5A2 2 0 0 1 6 4h12v15H6a2 2 0 0 0-2 2V5.5Z" />
    <path d="M4 19a2 2 0 0 1 2-2h12" />
  </Icon>
);

export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 4h3l1.5 4.5L7.5 10a12 12 0 0 0 6 6l1.5-2 4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Icon>
);

export const CrossIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3v18" />
    <path d="M6 8h12" />
  </Icon>
);

export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M17.5 15.4c2.1.7 3.5 2.2 3.5 4.6" />
  </Icon>
);

export const GradIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 4 2 9l10 5 10-5-10-5Z" />
    <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
    <path d="M22 9v5" />
  </Icon>
);

export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
  </Icon>
);

export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2.6v2.4M12 19v2.4M2.6 12H5M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
  </Icon>
);

/** School building: house shape with a flag, distinct from HomeIcon. */
export const SchoolIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 21V10l8-6 8 6v11" />
    <path d="M4 21h16" />
    <path d="M10 21v-4.5a2 2 0 0 1 4 0V21" />
    <path d="M12 4V1.8h3" />
  </Icon>
);

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Icon>
);

export const TvIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M8 21h8M10 10l4 2-4 2v-4Z" />
  </Icon>
);

export const CalculatorIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="5" y="3" width="14" height="18" rx="1.5" />
    <path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4" />
  </Icon>
);

export const ChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m14 6 4 4" />
  </Icon>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </Icon>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);

export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const SunIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </Icon>
);

export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M21 12.8A8 8 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" />
  </Icon>
);

export const MailIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const PassIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8" />
    <path d="M11 12h10m0 0-3-3m3 3-3 3" />
  </Icon>
);

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

export const GripIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 8h16M4 12h16M4 16h16" />
  </Icon>
);
