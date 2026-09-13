import {
  itemUrlHost,
  type ItemListItem,
  type ItemUrl,
  type ItemVisualSummary,
} from "../shared/item";

function itemSourceFor(item: ItemListItem): string | null {
  return item.metadataSummary?.siteName?.trim() || itemUrlHost(item.url);
}

function itemAuthorFor(item: ItemListItem): string | null {
  return item.metadataSummary?.author?.trim() || null;
}

type ItemSourcePresentation = {
  label: string;
  href: ItemUrl | null;
  hostname: string | null;
};

export function itemSourcePresentationFor(
  item: ItemListItem,
): ItemSourcePresentation | null {
  const author = itemAuthorFor(item);
  const source = itemSourceFor(item);
  const presentsAuthor = item.type === "video" || item.type === "podcast";
  const label = presentsAuthor ? author ?? source : source ?? author;

  if (label === null) return null;

  return {
    label,
    href: presentsAuthor ? null : item.url,
    hostname: itemFaviconHostnameFor(item),
  };
}

export function itemFaviconHostnameFor(item: Pick<ItemListItem, "url">): string | null {
  return item.url === null ? null : new URL(item.url).hostname;
}

export function itemVisualFor(item: ItemListItem): ItemVisualSummary | null {
  const summary = item.metadataSummary;
  if (summary === null) return null;

  const { imageUrl, imageKind } = summary;
  if (imageUrl === null || imageKind === null) return null;

  return { ...summary, imageUrl, imageKind };
}
