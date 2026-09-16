import type { KickoffFact } from "@/lib/kickoff-about";

export function KickoffFacts({ facts }: { facts: KickoffFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.key}>
          <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{fact.label}</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-ink">
            {fact.href ? (
              <a
                href={fact.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {fact.value}
              </a>
            ) : (
              fact.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
