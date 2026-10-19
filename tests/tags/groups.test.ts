import test from "node:test";
import assert from "node:assert/strict";
import { groupTags, tagDisplay } from "../../src/lib/tag-groups";

const tags = (names: string[]) => names.map((name, i) => ({ id: String(i), name, color: "#2a6f6f" }));

test("命名空间按原著、角色、标签、作者顺序展示，不修改原标签", () => {
  const input = tags(["artist:Test Artist", "landscape", "character:Test Character", "parody:Test Work"]);
  const before = structuredClone(input);
  const groups = groupTags(input);
  assert.deepEqual(groups.map((g) => g.label), ["原著", "角色", "标签", "作者"]);
  assert.deepEqual(groups.map((g) => g.tags[0].displayName), ["Test Work", "Test Character", "landscape", "Test Artist"]);
  assert.deepEqual(input, before);
  assert.equal(groups[3].tags[0].name, "artist:Test Artist");
});

test("没有内容的分类不输出，识别前缀但没有名称的标签不输出", () => {
  assert.deepEqual(groupTags([]), []);
  assert.deepEqual(groupTags(tags(["artist:", "character:  ", "原著：", "  "])), []);
  const groups = groupTags(tags(["仅普通标签", "artist:"]));
  assert.equal(groups.length, 1); assert.equal(groups[0].key, "general");
});

test("支持大小写、空格、中文全角冒号与常用别名", () => {
  assert.deepEqual(tagDisplay("  ARTIST : Alice  "), { category: "author", label: "Alice" });
  assert.deepEqual(tagDisplay("作者：测试作者"), { category: "author", label: "测试作者" });
  assert.deepEqual(tagDisplay("copyright:Original Work"), { category: "work", label: "Original Work" });
  assert.deepEqual(tagDisplay("角色：角色甲"), { category: "character", label: "角色甲" });
  assert.deepEqual(tagDisplay("標籤：风景"), { category: "general", label: "风景" });
});

test("未知命名空间保留信息，不猜测分类或丢失限定词", () => {
  assert.deepEqual(tagDisplay("language:chinese"), { category: "general", label: "language:chinese" });
  assert.deepEqual(tagDisplay("custom:blue"), { category: "general", label: "custom:blue" });
  assert.deepEqual(tagDisplay("constructor:test"), { category: "general", label: "constructor:test" });
  assert.equal(groupTags(tags(["__proto__:safe", "toString:safe"])).length, 1);
});

test("分组不截断底层数据，查看全部仍可拿到所有标签及原始 ID", () => {
  const input = tags(Array.from({ length: 12 }, (_, i) => `character:角色${i}`));
  const groups = groupTags(input);
  assert.equal(groups.length, 1); assert.equal(groups[0].tags.length, 12);
  assert.deepEqual(groups[0].tags.map((t) => t.id), input.map((t) => t.id));
});
