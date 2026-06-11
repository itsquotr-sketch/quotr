interface MissingInformationPanelProps {
  items: string[];
  className?: string;
}

export function MissingInformationPanel({
  items,
  className,
}: MissingInformationPanelProps) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <h4 className="text-xs font-semibold">What would tighten this estimate?</h4>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-xs text-muted-foreground">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
