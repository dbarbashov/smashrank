import { type PropsWithChildren, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getPrimaryNavIndex } from "./navigation.js";

export function RouteTransition({ children }: PropsWithChildren) {
  const location = useLocation();
  const previousPathRef = useRef(location.pathname);
  const previousRank = getPrimaryNavIndex(previousPathRef.current);
  const currentRank = getPrimaryNavIndex(location.pathname);
  const direction = currentRank < previousRank ? "back" : "forward";

  useEffect(() => {
    previousPathRef.current = location.pathname;
  }, [location.pathname]);

  return (
    <main className="route-content-shell">
      <div
        key={location.key}
        className="route-content"
        data-direction={direction}
      >
        {children}
      </div>
    </main>
  );
}
