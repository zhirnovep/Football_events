export default function BallIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ballGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#baf24a" />
          <stop offset="100%" stopColor="#5fae1f" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="url(#ballGrad)" />
      <circle cx="24" cy="24" r="21" fill="none" stroke="#1c3a0f" strokeOpacity="0.25" strokeWidth="1.5" />
      <g fill="#12260a" opacity="0.92">
        <polygon points="24,13 29.5,17 27.5,23.2 20.5,23.2 18.5,17" />
        <polygon points="24,13 24,7.5 18,9.5 18.5,17" opacity="0" />
      </g>
      <g stroke="#12260a" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M24 13 L24 6.5" />
        <path d="M18.5 17 L11.5 15" />
        <path d="M20.5 23.2 L16 29.5" />
        <path d="M27.5 23.2 L32 29.5" />
        <path d="M29.5 17 L36.5 15" />
      </g>
      <polygon points="24,13 29.5,17 27.5,23.2 20.5,23.2 18.5,17" fill="#12260a" opacity="0.9" />
      <circle cx="24" cy="6.8" r="2" fill="#12260a" opacity="0.9" />
      <circle cx="11.2" cy="14.6" r="2" fill="#12260a" opacity="0.9" />
      <circle cx="15.6" cy="30" r="2" fill="#12260a" opacity="0.9" />
      <circle cx="32.4" cy="30" r="2" fill="#12260a" opacity="0.9" />
      <circle cx="36.8" cy="14.6" r="2" fill="#12260a" opacity="0.9" />
    </svg>
  )
}
