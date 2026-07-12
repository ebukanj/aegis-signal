import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared header/footer chrome for authentication forms. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      {footer && (
        <div className="text-center text-sm text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}
