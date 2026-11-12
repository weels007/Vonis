type Props = {
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Vonis seal: a balance scale inside a ring, with a V-shaped base that doubles
 * as the verdict mark. Brass on ink with a verdigris pivot.
 */
export default function Logo({ size = 40, className, title = "Vonis seal" }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="vonisBrass"
          x1="8"
          y1="6"
          x2="56"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#F6D993" />
          <stop offset="0.55" stopColor="#E3B65C" />
          <stop offset="1" stopColor="#A9792A" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="30" fill="#0E1511" stroke="url(#vonisBrass)" strokeWidth="2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#33422F" strokeWidth="1" />

      <path d="M18 24h28" stroke="url(#vonisBrass)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M18 24v7M46 24v7"
        stroke="url(#vonisBrass)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 31a6 6 0 0 0 12 0"
        fill="none"
        stroke="url(#vonisBrass)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M40 31a6 6 0 0 0 12 0"
        fill="none"
        stroke="url(#vonisBrass)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <path d="M32 24v18" stroke="url(#vonisBrass)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M25 43l7 8 7-8"
        fill="none"
        stroke="url(#vonisBrass)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="32" cy="24" r="2.8" fill="#6FAE93" stroke="#0E1511" strokeWidth="1.2" />
    </svg>
  );
}
