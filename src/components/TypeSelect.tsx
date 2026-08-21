import { Select } from "@base-ui/react/select";
import { TYPE_OPTIONS, type ItemType } from "../item";

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
        <Select.Trigger className="type-trigger" aria-label="Type">
          <Select.Value />
          <Select.Icon>
            <svg
              className="type-chevron"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
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
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
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
