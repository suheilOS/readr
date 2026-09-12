import { Select } from "@base-ui/react/select";
import { TYPE_OPTIONS, type ItemType } from "../../shared/item";
import {
  ArticleTypeIcon,
  BookTypeIcon,
  ChevronDownIcon,
  PaperTypeIcon,
  PodcastTypeIcon,
  VideoTypeIcon,
} from "./icons";

type TypeSelectProps = {
  value: ItemType;
  onChange: (type: ItemType) => void;
  disabled?: boolean;
};

export function TypeSelect({ value, onChange, disabled = false }: TypeSelectProps) {
  function handleValueChange(nextValue: ItemType | null) {
    if (nextValue !== null) {
      onChange(nextValue);
    }
  }

  return (
    <div className="type-select">
      <Select.Root<ItemType>
        items={TYPE_OPTIONS}
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <Select.Trigger
          className="type-trigger"
          aria-label="Type"
          data-slot="select-trigger"
        >
          <span className="type-value">
            <span className="type-prefix">Type:</span>
            <Select.Value />
          </span>
          <Select.Icon>
            <ChevronDownIcon className="type-chevron" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className="type-positioner"
            sideOffset={4}
            alignItemWithTrigger={false}
          >
            <Select.Popup className="type-menu">
              <Select.List className="type-list">
                {TYPE_OPTIONS.map((option) => (
                  <Select.Item key={option.value} value={option.value} className="type-option">
                    <span className="type-option-label">
                      {option.value === "article" && <ArticleTypeIcon className="type-option-icon" />}
                      {option.value === "book" && <BookTypeIcon className="type-option-icon" />}
                      {option.value === "paper" && <PaperTypeIcon className="type-option-icon" />}
                      {option.value === "video" && <VideoTypeIcon className="type-option-icon" />}
                      {option.value === "podcast" && <PodcastTypeIcon className="type-option-icon" />}
                      <Select.ItemText>{option.label}</Select.ItemText>
                    </span>
                    <Select.ItemIndicator className="type-check">
                      <span className="type-selected-dot" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
