export function formatCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyRange(
  low: number | null,
  high: number | null
): string {
  if (low == null || high == null) return "—";
  if (low === high) return formatCurrency(low);
  return `${formatCurrency(low)} – ${formatCurrency(high)}`;
}
