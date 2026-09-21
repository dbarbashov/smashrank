import { NavLink, useLocation } from "react-router-dom";
import {
  SlidingIndicator,
  useSlidingIndicator,
} from "./sliding-indicator.js";

export type AnimatedNavTab = {
  to: string;
  label: string;
  end?: boolean;
};

type AnimatedNavProps = {
  tabs: AnimatedNavTab[];
};

export function AnimatedNav({ tabs }: AnimatedNavProps) {
  const location = useLocation();
  const { trackRef, position } = useSlidingIndicator(
    '[aria-current="page"]',
    location.pathname,
  );

  return (
    <nav
      aria-label="Primary navigation"
      className="ios-nav mb-8 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60"
    >
      <div ref={trackRef} className="ios-nav-track">
        <SlidingIndicator position={position} />

        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `ios-nav-link whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
