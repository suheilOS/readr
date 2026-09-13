import type { ItemType } from "../../shared/item";
import {
  ArticleTypeIcon,
  BookTypeIcon,
  PaperTypeIcon,
  PodcastTypeIcon,
  VideoTypeIcon,
} from "./icons";

type ItemTypeIconProps = {
  type: ItemType;
  className?: string;
};

export function ItemTypeIcon({ type, className }: ItemTypeIconProps) {
  switch (type) {
    case "article":
      return <ArticleTypeIcon className={className} />;
    case "book":
      return <BookTypeIcon className={className} />;
    case "paper":
      return <PaperTypeIcon className={className} />;
    case "video":
      return <VideoTypeIcon className={className} />;
    case "podcast":
      return <PodcastTypeIcon className={className} />;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}
