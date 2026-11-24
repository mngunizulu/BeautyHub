import { and, eq, sql } from "drizzle-orm";
import { locations, organizations } from "@workspace/db";

export const publicLocation = and(eq(locations.published, true), sql`exists (
  select 1 from ${organizations} where ${organizations.id} = ${locations.organizationId}
    and ${organizations.suspendedAt} is null
)`)!;
