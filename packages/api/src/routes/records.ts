import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, recordQueries } from "@smashrank/db";

export const recordsRoutes = new Hono<AppEnv>();

recordsRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const records = await recordQueries(sql).getGroupRecords(group.id);
  return c.json(records);
});
