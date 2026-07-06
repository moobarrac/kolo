interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

// Consistent page heading used by every view.
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-3xl font-bold text-forest">{title}</h1>
      {subtitle && <p className="mt-1 text-ink/60">{subtitle}</p>}
    </header>
  );
}
