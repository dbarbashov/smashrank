import { createMiddleware } from "hono/factory";
import type { Group } from "@smashrank/db";
import { getConnection, groupQueries } from "@smashrank/db";

type Env = {
  Variables: {
    group: Group;
  };
};

export const resolveGroup = createMiddleware<Env>(async (c, next) => {
  const slug = c.req.param("slug") as string;
  const sql = getConnection();
  const group = await groupQueries(sql).findBySlug(slug);

  if (!group) {
    return c.json({ error: "Group not found" }, 404);
  }

  c.set("group", group);
  await next();
});
