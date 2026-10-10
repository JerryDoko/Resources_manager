const channelName = "rm-novel-extensions";
export function publishExtensionChange(profileId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ profileId }); channel.close();
}
export function subscribeExtensionChanges(reload: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = event => { if (typeof event.data?.profileId === "string") reload(); };
  return () => channel.close();
}
