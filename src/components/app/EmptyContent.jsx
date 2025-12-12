export function EmptyContent({
  title = "Nothing here yet",
  message = "Check back soon for updates.",
  helperText = "We're getting this ready for you.",
  icon,
  className = "",
}) {
  return (
    <div className={`flex-1 w-full relartive ${className}`}>
      <div className="bg-background rounded-2xl overflow-hidden border border-border shadow-sm w-full">
        <div className="relative min-h-[260px] sm:min-h-[320px] md:min-h-[380px] flex flex-col items-center justify-center px-6 py-10">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Primary stripe layer */}
            <div
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 20px,
                  currentColor 20px,
                  currentColor 21px
                )`,
              }}
            />
            {/* Secondary stripe layer for enhanced depth */}
            <div
              className="absolute inset-0 opacity-[0.008]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 40px,
                  currentColor 40px,
                  currentColor 41px
                )`,
              }}
            />
          </div>

          {/* Content */}
          <div className="relative z-10 text-center max-w-md mx-auto">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 rounded-xl bg-muted flex items-center justify-center transition-transform hover:scale-105">
              {icon ? (
                <div className="text-muted-foreground">{icon}</div>
              ) : (
                <svg
                  className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
              )}
            </div>

            <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-3 text-balance">{title}</h3>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-6 text-pretty">{message}</p>

            {helperText && (
              <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-full border border-border/50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{helperText}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}










