import {
  itemUrlHost,
  type ItemListItem,
  type ItemVisualSummary,
} from "../shared/item";

export function itemSourceFor(item: ItemListItem): string | null {
  return item.metadataSummary?.siteName?.trim() || itemUrlHost(item.url);
}

export function itemAuthorFor(item: ItemListItem): string | null {
  return item.metadataSummary?.author?.trim() || null;
}

export function itemVisualFor(item: ItemListItem): ItemVisualSummary | null {
  const summary = item.metadataSummary;
  if (summary === null) return null;

  const { imageUrl, imageKind } = summary;
  if (imageUrl === null || imageKind === null) return null;

  return { ...summary, imageUrl, imageKind };
}
