import { and, eq, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { type getDb, schema } from "@/lib/db";
import { isRecord, type HikariSource } from "@/lib/hikari-metadata";

export function importHikariSources(
  db: ReturnType<typeof getDb>,
  itemId: string,
  sources: HikariSource[],
  now: number
): boolean {
  if (!sources.length) return false;
  return db.transaction((tx) => {
    const item = tx.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, itemId)).get();
    if (!item) return false;
    let metadata: unknown;
    try {
      metadata = JSON.parse(item.metadata || "{}");
    } catch {
      return false;
    }
    // Do not destroy even malformed legacy preferences to attach a source.
    if (!isRecord(metadata) || (metadata.hikari !== undefined && !isRecord(metadata.hikari))) return false;
    const hikari = isRecord(metadata.hikari) ? metadata.hikari : {};
    if (hikari.sources !== undefined && !Array.isArray(hikari.sources)) return false;
    const merged = new Map<unknown, Record<string, unknown>>();
    const other: unknown[] = [];
    for (const source of (hikari.sources || []) as unknown[]) {
      if (isRecord(source) && typeof source.id === "string") merged.set(source.id, source);
      else other.push(source);
    }
    for (const source of sources) merged.set(source.id, { ...merged.get(source.id), ...source });
    const next = JSON.stringify({ ...metadata, hikari: { ...hikari, sources: [...merged.values(), ...other] } });
    let changed = next !== item.metadata;
    if (changed) tx.update(schema.mediaItems).set({ metadata: next }).where(eq(schema.mediaItems.id, itemId)).run();

    for (const name of new Set(sources.flatMap((source) => source.tags))) {
      let tag = tx.select().from(schema.tags).where(eq(schema.tags.name, name)).get();
      if (!tag) {
        tx.insert(schema.tags).values({ id: uuid(), name, color: "#2a6f6f", createdAt: now }).onConflictDoNothing().run();
        tag = tx.select().from(schema.tags).where(eq(schema.tags.name, name)).get();
      }
      if (!tag) continue;
      const tagId = tag.id;
      // Old databases may lack a composite unique constraint on series_tags.
      const inserted = tx.run(sql`INSERT INTO ${schema.seriesTags} (series_id, tag_id)
        SELECT ${item.seriesId}, ${tagId} WHERE NOT EXISTS (
          SELECT 1 FROM ${schema.seriesTags} WHERE ${and(
            eq(schema.seriesTags.seriesId, item.seriesId), eq(schema.seriesTags.tagId, tagId)
          )}
        )`);
      if (inserted.changes > 0) changed = true;
    }
    return changed;
  });
}
