import { z } from "zod";

const commentsSchema = z.array(z.string().max(20000)).max(500);
export function validateComments(value: unknown): string[] {
  const result = commentsSchema.safeParse(value);
  if (!result.success) throw new Error("章节评论无效，最多 500 条，每条最多 20000 字");
  return result.data.map(text => text.trim()).filter(Boolean);
}
