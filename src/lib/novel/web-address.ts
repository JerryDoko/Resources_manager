import { lookup } from "dns/promises";
import { BlockList, isIP } from "net";

const blocked = new BlockList();
const blocked6 = new BlockList();
const proxyAddresses = new BlockList();
proxyAddresses.addSubnet("198.18.0.0", 15, "ipv4");
for (const [base, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["192.0.0.0",24],["192.0.2.0",24],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(base, prefix, "ipv4");
for (const [base, prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32],["::ffff:0:0",96],["64:ff9b::",96],["2002::",16]] as const) blocked6.addSubnet(base, prefix, "ipv6");

export const publicAddress = (address: string) => isIP(address) === 4
  ? !blocked.check(address, "ipv4")
  : isIP(address) === 6 && !blocked6.check(address, "ipv6");

type Address = { address: string; family: number };
type AddressResolvers = {
  system: (host: string) => Promise<Address[]>;
  publicDNS: (host: string, signal?: AbortSignal) => Promise<Address[]>;
};

async function publicDNS(host: string, signal?: AbortSignal): Promise<Address[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", host);
  url.searchParams.set("type", "A");
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: "error",
  });
  if (!response.ok) throw new Error("查询公网地址失败，请检查网络后重试");
  const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
  if (data.Status !== 0) throw new Error("无法解析该网站的公网地址");
  return (data.Answer || []).filter(a => a.type === 1).map(a => ({ address: a.data, family: 4 }));
}

export async function resolvePageAddress(host: string, signal?: AbortSignal, resolvers: AddressResolvers = {
  system: host => lookup(host, { all: true }),
  publicDNS,
}): Promise<Address> {
  const denied = () => new Error("不能导入本机或内网地址");
  // Literal addresses must never use a public DNS fallback.
  if (isIP(host)) {
    if (!publicAddress(host)) throw denied();
    return { address: host, family: isIP(host) };
  }
  let addresses = await resolvers.system(host);
  const virtual = (a: Address) => isIP(a.address) === 4 && proxyAddresses.check(a.address, "ipv4");
  if (addresses.some(virtual)) {
    // Proxy fake-IP is a reason to resolve again, never a permitted destination.
    // Reject any other private address even in a mixed DNS answer.
    if (addresses.some(a => !publicAddress(a.address) && !virtual(a))) throw denied();
    addresses = await resolvers.publicDNS(host, signal);
  }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw denied();
  return addresses[0];
}
