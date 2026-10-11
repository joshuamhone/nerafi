export type IconProps = {
  size?: number;
  className?: string;
};

export function RefreshIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13.4 8a5.4 5.4 0 1 1-1.58-3.82"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13.4 2.6v3h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LockIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.25"
        y="7"
        width="9.5"
        height="6.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OverviewIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2.25"
        y="2.25"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="9.25"
        y="2.25"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2.25"
        y="9.25"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="9.25"
        y="9.25"
        width="4.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function SendIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.25 13.75 13.75 2.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.25 2.25h7.5v7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReceiveIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13.75 2.25 2.25 13.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2.25 9.75v4h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActivityIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="8"
        cy="8"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 5.5V8l2 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SelfIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 5.5h9.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m9.75 3.5 2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 10.5H4.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m6.25 8.5-2 2 2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContractIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m6 5-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m10 5 3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
