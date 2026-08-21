const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(isoDate));
}
