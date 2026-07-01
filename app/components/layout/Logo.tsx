export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="20" y1="100" x2="180" y2="100" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
      <line x1="100" y1="20" x2="100" y2="180" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" />
      <path d="M30 150 C 60 130, 80 160, 100 130 C 120 100, 140 120, 170 90" stroke="#475569" strokeWidth="1.5" />
      <path d="M30 120 C 60 90, 80 130, 100 100 C 120 70, 140 100, 170 60" stroke="url(#gao)" strokeWidth="2" strokeLinecap="round" />
      <path d="M35 85 C 65 65, 85 95, 100 80 C 115 65, 135 80, 165 45" stroke="#64748b" strokeWidth="1.2" strokeDasharray="3 3" />
      <g>
        <line x1="100" y1="100" x2="100" y2="50" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" />
        <circle cx="100" cy="100" r="4.5" fill="#f59e0b" />
        <circle cx="100" cy="100" r="8" stroke="#f59e0b" strokeWidth="0.5" opacity="0.5" />
        <circle cx="100" cy="50" r="3" fill="#fb7185" />
        <line x1="60" y1="110" x2="60" y2="150" stroke="#64748b" strokeWidth="1" />
        <circle cx="60" cy="110" r="3.5" fill="#fb7185" />
        <line x1="140" y1="90" x2="140" y2="120" stroke="#64748b" strokeWidth="1" />
        <circle cx="140" cy="90" r="3.5" fill="#fb7185" />
      </g>
      <defs>
        <linearGradient id="gao" x1="30" y1="100" x2="170" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="60%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
    </svg>
  )
}
