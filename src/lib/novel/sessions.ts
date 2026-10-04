import { randomUUID } from "crypto";
import { loadRegistry } from "@/lib/profiles";
export interface NovelSession { id: string; profileId: string; itemId: string; touched: number }
type State = { active: NovelSession | null; cancel: Set<(id: string) => void>; workspaceEpochs?:Map<string,number> };
const root = globalThis as typeof globalThis & { rmNovelSessions?: State };
const state = root.rmNovelSessions ||= { active: null, cancel: new Set() };
const epochs=state.workspaceEpochs ||= new Map();
export function invalidateNovelWorkspace(profileId:string){epochs.set(profileId,(epochs.get(profileId)||0)+1);revokeNovelSessions(profileId);}
export function captureNovelWorkspace(profileId:string){assertProfile(profileId);const epoch=epochs.get(profileId)||0;return ()=>{assertProfile(profileId);if((epochs.get(profileId)||0)!==epoch)throw new Error("工作区已切换，旧导入任务已取消");};}
export function assertProfile(profileId: string) {
  const r = loadRegistry();
  if (!profileId || !r.profiles.some(p => p.id === profileId)) throw new Error("工作区已删除或不存在");
  if (r.activeId !== profileId) throw new Error("工作区已切换，请重新打开小说");
}
export function revokeNovelSessions(profileId?: string) {
  const old = state.active;
  if (!old || (profileId && old.profileId !== profileId)) return;
  state.active = null;
  for (const cancel of state.cancel) cancel(old.id);
}
export function beginSession(profileId: string, itemId: string) {
  assertProfile(profileId); revokeNovelSessions();
  state.active = { id: randomUUID(), profileId, itemId, touched: Date.now() };
  return state.active;
}
export function assertSession(profileId: string, itemId: string, sessionId: string) {
  assertProfile(profileId);
  const s = state.active;
  if (!s || s.id !== sessionId || s.profileId !== profileId || s.itemId !== itemId) throw new Error("朗读会话已取消");
  s.touched = Date.now(); return s;
}
export function cancelSession(id: string) { if (state.active?.id === id) revokeNovelSessions(); }
export function onSessionCancel(fn: (id: string) => void) { state.cancel.add(fn); return () => state.cancel.delete(fn); }
