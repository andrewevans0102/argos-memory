interface ArgosHoundLogoProps {
  className?: string;
  size?: number;
}

export function ArgosHoundLogo({ className = 'w-9 h-9', size }: ArgosHoundLogoProps) {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <div
      style={style}
      className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-indigo-600 p-1 shadow-lg shadow-amber-500/10 ring-1 ring-white/15 select-none overflow-hidden ${className}`}
      title="Argos — Odysseus's Faithful Hound"
    >
      <svg
        viewBox="60 90 392 392"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full drop-shadow-sm"
      >
        <defs>
          <linearGradient id="logoFurHead" x1="256" y1="120" x2="256" y2="440" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffbeb" />
            <stop offset="0.3" stopColor="#fef3c7" />
            <stop offset="0.7" stopColor="#fde68a" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="logoFurEarL" x1="100" y1="140" x2="180" y2="340" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ea580c" />
            <stop offset="0.6" stopColor="#c2410c" />
            <stop offset="1" stopColor="#9a3412" />
          </linearGradient>
          <linearGradient id="logoFurEarR" x1="412" y1="140" x2="332" y2="340" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ea580c" />
            <stop offset="0.6" stopColor="#c2410c" />
            <stop offset="1" stopColor="#9a3412" />
          </linearGradient>
          <linearGradient id="logoCollarGrad" x1="150" y1="390" x2="362" y2="430" gradientUnits="userSpaceOnUse">
            <stop stopColor="#312e81" />
            <stop offset="0.5" stopColor="#4338ca" />
            <stop offset="1" stopColor="#1e1b4b" />
          </linearGradient>
          <linearGradient id="logoGoldMedal" x1="240" y1="410" x2="272" y2="455" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef08a" />
            <stop offset="0.4" stopColor="#facc15" />
            <stop offset="1" stopColor="#ca8a04" />
          </linearGradient>
        </defs>

        {/* Shoulders / Chest Base */}
        <path
          d="M 125 470 C 140 435, 160 410, 180 395 L 332 395 C 352 410, 372 435, 387 470 Z"
          fill="url(#logoFurHead)"
        />
        <path
          d="M 220 405 C 240 405, 272 405, 292 405 C 305 435, 315 455, 320 470 L 192 470 C 197 455, 207 435, 220 405 Z"
          fill="#ffffff"
          opacity="0.85"
        />

        {/* Left Floppy Ear */}
        <path
          d="M 180 145 C 115 145, 85 200, 100 275 C 110 325, 138 365, 175 355 C 195 350, 198 315, 190 270 C 185 240, 185 180, 180 145 Z"
          fill="url(#logoFurEarL)"
        />
        <path
          d="M 170 165 C 128 175, 112 220, 118 280 C 125 320, 142 345, 168 340 C 178 335, 180 310, 175 270 C 172 240, 172 195, 170 165 Z"
          fill="#7c2d12"
          opacity="0.45"
        />

        {/* Right Floppy Ear */}
        <path
          d="M 332 145 C 397 145, 427 200, 412 275 C 402 325, 374 365, 337 355 C 317 350, 314 315, 322 270 C 327 240, 327 180, 332 145 Z"
          fill="url(#logoFurEarR)"
        />
        <path
          d="M 342 165 C 384 175, 400 220, 394 280 C 387 320, 370 345, 344 340 C 334 335, 332 310, 337 270 C 340 240, 340 195, 342 165 Z"
          fill="#7c2d12"
          opacity="0.45"
        />

        {/* Dog Head Base */}
        <path
          d="M 180 145 C 215 125, 297 125, 332 145 C 365 170, 375 225, 372 285 C 370 335, 355 375, 340 405 L 172 405 C 157 375, 142 335, 140 285 C 137 225, 147 170, 180 145 Z"
          fill="url(#logoFurHead)"
        />

        {/* White Forehead Blaze & Snout Base */}
        <path
          d="M 248 135 C 252 135, 260 135, 264 135 C 268 180, 275 210, 290 235 C 325 240, 345 265, 345 305 C 345 345, 315 375, 256 375 C 197 375, 167 345, 167 305 C 167 265, 187 240, 222 235 C 237 210, 244 180, 248 135 Z"
          fill="#ffffff"
          opacity="0.95"
        />

        {/* Eyes */}
        <ellipse cx="205" cy="225" rx="14" ry="16" fill="#0f172a" />
        <circle cx="207" cy="226" r="11" fill="#78350f" />
        <circle cx="207" cy="226" r="7.5" fill="#0f172a" />
        <circle cx="211" cy="220" r="3.8" fill="#ffffff" />
        <circle cx="203" cy="231" r="1.8" fill="#ffffff" opacity="0.8" />
        <ellipse cx="202" cy="195" rx="8" ry="5" fill="#ea580c" />

        <ellipse cx="307" cy="225" rx="14" ry="16" fill="#0f172a" />
        <circle cx="305" cy="226" r="11" fill="#78350f" />
        <circle cx="305" cy="226" r="7.5" fill="#0f172a" />
        <circle cx="309" cy="220" r="3.8" fill="#ffffff" />
        <circle cx="301" cy="231" r="1.8" fill="#ffffff" opacity="0.8" />
        <ellipse cx="310" cy="195" rx="8" ry="5" fill="#ea580c" />

        {/* Dog Nose */}
        <path
          d="M 230 270 C 240 262, 272 262, 282 270 C 292 278, 290 295, 278 305 C 268 313, 244 313, 234 305 C 222 295, 220 278, 230 270 Z"
          fill="#0f172a"
        />
        <ellipse cx="243" cy="290" rx="3.5" ry="2.5" fill="#1e293b" />
        <ellipse cx="269" cy="290" rx="3.5" ry="2.5" fill="#1e293b" />
        <ellipse cx="256" cy="275" rx="12" ry="4" fill="#ffffff" opacity="0.35" />

        {/* Dog Smile Line & Tongue */}
        <path d="M 256 308 L 256 325" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M 225 325 C 235 342, 250 342, 256 325 C 262 342, 277 342, 287 325"
          stroke="#78350f"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M 246 333 C 246 352, 266 352, 266 333 Z" fill="#f43f5e" />
        <path d="M 256 333 L 256 345" stroke="#be123c" strokeWidth="1.5" strokeLinecap="round" />

        {/* Whisker Dots */}
        <circle cx="215" cy="305" r="2" fill="#b45309" opacity="0.6" />
        <circle cx="205" cy="312" r="2" fill="#b45309" opacity="0.6" />
        <circle cx="215" cy="320" r="2" fill="#b45309" opacity="0.6" />
        <circle cx="297" cy="305" r="2" fill="#b45309" opacity="0.6" />
        <circle cx="307" cy="312" r="2" fill="#b45309" opacity="0.6" />
        <circle cx="297" cy="320" r="2" fill="#b45309" opacity="0.6" />

        {/* Dog Collar */}
        <path
          d="M 160 395 C 210 410, 302 410, 352 395 L 356 422 C 302 438, 210 438, 156 422 Z"
          fill="url(#logoCollarGrad)"
        />
        <path
          d="M 160 395 C 210 410, 302 410, 352 395"
          stroke="#fbbf24"
          strokeWidth="2.5"
          fill="none"
        />

        {/* Gold Medallion with Argos Paw */}
        <circle cx="256" cy="418" r="6" stroke="#fbbf24" strokeWidth="3" fill="none" />
        <circle cx="256" cy="440" r="18" fill="url(#logoGoldMedal)" />
        <circle cx="256" cy="440" r="15" stroke="#fffbeb" strokeWidth="1.5" fill="none" opacity="0.7" />
        <ellipse cx="256" cy="442" rx="5" ry="4" fill="#78350f" />
        <circle cx="249" cy="435" r="2.2" fill="#78350f" />
        <circle cx="256" cy="433" r="2.2" fill="#78350f" />
        <circle cx="263" cy="435" r="2.2" fill="#78350f" />
      </svg>
    </div>
  );
}
