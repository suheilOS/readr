const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const compactDateFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(isoDate));
}

export function formatCompactDate(isoDate: string): string {
  return compactDateFormat.format(new Date(isoDate));
}
