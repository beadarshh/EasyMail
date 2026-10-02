/** The EasyMail mark: a geometric "M", monochrome, no background. Inherits text color. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={`shrink-0 text-fg ${className ?? ""}`}>
      <path d="M8 8 32 32 8 56Z" fill="currentColor" />
      <path d="M20 44 56 8V32L32 56Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M44 44 56 32V56Z" fill="currentColor" />
    </svg>
  );
}
