import { serve } from "@hono/node-server";
import postgres from "postgres";
import { setConnection } from "@smashrank/db";
import { createApp } from "./app.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = postgres(url);
setConnection(sql);

const port = parseInt(process.env.PORT ?? "3000", 10);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SmashRank API listening on port ${info.port}`);
});
