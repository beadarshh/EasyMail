import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">EasyMail</span>
        </div>
        {children}
      </div>
    </main>
  );
}
