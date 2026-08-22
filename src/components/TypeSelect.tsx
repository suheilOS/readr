import { Select } from "@base-ui/react/select";
import { TYPE_OPTIONS, type ItemType } from "../item";
import { CheckIcon, ChevronDownIcon } from "./icons";

type TypeSelectProps = {
  value: ItemType;
  onChange: (type: ItemType) => void;
};

export function TypeSelect({ value, onChange }: TypeSelectProps) {
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
      >
        <Select.Trigger
          className="type-trigger"
          aria-label="Type"
          data-cuelume-toggle=""
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
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="type-check">
                      <CheckIcon />
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
