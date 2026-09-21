import {
  SlidingIndicator,
  useSlidingIndicator,
} from "./sliding-indicator.js";

export type AnimatedSegmentedOption<Value extends string = string> = {
  value: Value;
  label: string;
};

type AnimatedSegmentedControlProps<Value extends string> = {
  options: readonly AnimatedSegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
};

export function AnimatedSegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: AnimatedSegmentedControlProps<Value>) {
  const { trackRef, position } = useSlidingIndicator(
    '[data-segment-active="true"]',
    value,
  );

  return (
    <div
      aria-label={ariaLabel}
      className="ios-nav rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
      role="group"
    >
      <div ref={trackRef} className="ios-nav-track">
        <SlidingIndicator position={position} />

        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              className={`ios-nav-link cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              data-segment-active={isActive ? "true" : "false"}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
