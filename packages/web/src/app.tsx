import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/layout.js";
import { Leaderboard } from "./pages/leaderboard.js";
import { PlayerProfile } from "./pages/player-profile.js";
import { MatchHistory } from "./pages/match-history.js";
import { Achievements } from "./pages/achievements.js";
import { Seasons } from "./pages/seasons.js";
import { SeasonDetailPage } from "./pages/season-detail.js";
import { NotFound } from "./pages/not-found.js";

const router = createBrowserRouter([
  {
    path: "/g/:slug",
    element: <Layout />,
    children: [
      { index: true, element: <Leaderboard /> },
      { path: "player/:id", element: <PlayerProfile /> },
      { path: "matches", element: <MatchHistory /> },
      { path: "achievements", element: <Achievements /> },
      { path: "seasons", element: <Seasons /> },
      { path: "seasons/:seasonId", element: <SeasonDetailPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
