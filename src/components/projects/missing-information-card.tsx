interface MissingInformationCardProps {
  items: string[];
  className?: string;
}

export function MissingInformationCard({
  items,
  className,
}: MissingInformationCardProps) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
        <h4 className="text-xs font-semibold text-foreground">
          What would improve this estimate?
        </h4>
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li
              key={item}
              className="text-xs leading-snug text-amber-900 dark:text-amber-100"
            >
              · {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
