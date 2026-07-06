import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-display text-2xl font-bold text-forest">Page not found</p>
        <p className="mt-2 text-ink/55">That page doesn't exist.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-brass hover:underline">
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
