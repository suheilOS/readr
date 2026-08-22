const TRACKING_PARAMETER_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref_src",
  "yclid",
]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "local",
  "internal",
  "metadata.google.internal",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type Ipv4Range = {
  firstOctet: number;
  secondOctetFrom: number;
  secondOctetTo: number;
};

const NON_PUBLIC_IPV4_RANGES: readonly Ipv4Range[] = [
  { firstOctet: 0, secondOctetFrom: 0, secondOctetTo: 255 },
  { firstOctet: 10, secondOctetFrom: 0, secondOctetTo: 255 },
  { firstOctet: 100, secondOctetFrom: 64, secondOctetTo: 127 },
  { firstOctet: 127, secondOctetFrom: 0, secondOctetTo: 255 },
  { firstOctet: 169, secondOctetFrom: 254, secondOctetTo: 254 },
  { firstOctet: 172, secondOctetFrom: 16, secondOctetTo: 31 },
  { firstOctet: 192, secondOctetFrom: 0, secondOctetTo: 0 },
  { firstOctet: 192, secondOctetFrom: 168, secondOctetTo: 168 },
  { firstOctet: 198, secondOctetFrom: 18, secondOctetTo: 19 },
  { firstOctet: 198, secondOctetFrom: 51, secondOctetTo: 51 },
  { firstOctet: 203, secondOctetFrom: 0, secondOctetTo: 0 },
];

const NON_PUBLIC_IPV6_PREFIXES = new Set([
  0x20010db8,
  0x20010000,
  0x20010010,
  0x20010020,
  0x20010030,
  0x20010040,
  0x20010050,
  0x20010060,
  0x20010070,
  0x20010080,
  0x20010090,
  0x200100a0,
  0x200100b0,
  0x200100c0,
  0x200100d0,
  0x200100e0,
  0x200100f0,
]);

export const MAX_REDIRECTS = 3;

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function normalizePublicUrl(input: string): URL | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    isBlockedHostname(url.hostname)
  ) {
    return null;
  }

  for (const parameter of Array.from(url.searchParams.keys())) {
    if (
      parameter.toLowerCase().startsWith("utm_") ||
      TRACKING_PARAMETER_NAMES.has(parameter.toLowerCase())
    ) {
      url.searchParams.delete(parameter);
    }
  }

  url.hash = "";
  return url;
}

export function resolvePublicUrl(location: string, baseUrl: URL): URL | null {
  try {
    return normalizePublicUrl(new URL(location, baseUrl).toString());
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  const withoutBrackets = normalizedHostname.replace(/^\[|\]$/g, "");

  if (
    BLOCKED_HOSTNAMES.has(withoutBrackets) ||
    withoutBrackets.endsWith(".localhost") ||
    withoutBrackets.endsWith(".local") ||
    withoutBrackets.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4 = parseIpv4(withoutBrackets);
  if (ipv4 !== null) {
    return isNonPublicIpv4(ipv4);
  }

  const ipv6 = parseIpv6(withoutBrackets);
  return ipv6 !== null && isNonPublicIpv6(ipv6);
}

function parseIpv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }

  return (
    (octets[0] * 2 ** 24) +
    (octets[1] * 2 ** 16) +
    (octets[2] * 2 ** 8) +
    octets[3]
  ) >>> 0;
}

function isNonPublicIpv4(value: number): boolean {
  const firstOctet = value >>> 24;
  const secondOctet = (value >>> 16) & 255;

  return (
    firstOctet >= 224 ||
    NON_PUBLIC_IPV4_RANGES.some(
      (range) =>
        range.firstOctet === firstOctet &&
        secondOctet >= range.secondOctetFrom &&
        secondOctet <= range.secondOctetTo,
    )
  );
}

function parseIpv6(value: string): bigint | null {
  if (!value.includes(":")) {
    return null;
  }

  const compressionParts = value.split("::");
  if (compressionParts.length > 2) {
    return null;
  }

  const left = compressionParts[0] === "" ? [] : compressionParts[0].split(":");
  const right =
    compressionParts.length === 2 && compressionParts[1] !== ""
      ? compressionParts[1].split(":")
      : [];

  const leftValues = parseIpv6Parts(left);
  const rightValues = parseIpv6Parts(right);
  if (leftValues === null || rightValues === null) {
    return null;
  }

  const hasCompression = compressionParts.length === 2;
  const missing = 8 - leftValues.length - rightValues.length;
  if ((hasCompression && missing < 1) || (!hasCompression && missing !== 0)) {
    return null;
  }

  const values = [
    ...leftValues,
    ...(hasCompression ? Array.from({ length: missing }, () => 0) : []),
    ...rightValues,
  ];

  return values.reduce((result, part) => (result << 16n) | BigInt(part), 0n);
}

function parseIpv6Parts(parts: string[]): number[] | null {
  if (parts.length === 0) {
    return [];
  }

  const lastPart = parts.at(-1);
  if (lastPart !== undefined && lastPart.includes(".")) {
    const ipv4 = parseIpv4(lastPart);
    if (ipv4 === null) {
      return null;
    }

    const withoutIpv4 = parts.slice(0, -1);
    const parsedParts = parseIpv6Parts(withoutIpv4);
    if (parsedParts === null) {
      return null;
    }

    return [
      ...parsedParts,
      ipv4 >>> 16,
      ipv4 & 0xffff,
    ];
  }

  const values = parts.map((part) => Number.parseInt(part, 16));
  if (
    values.some(
      (value, index) =>
        !/^[0-9a-f]{1,4}$/i.test(parts[index]) || value < 0 || value > 0xffff,
    )
  ) {
    return null;
  }

  return values;
}

function isNonPublicIpv6(value: bigint): boolean {
  const firstByte = Number((value >> 120n) & 0xffn);
  const first16 = Number((value >> 112n) & 0xffffn);
  const first32 = Number((value >> 96n) & 0xffffffffn);

  return (
    value === 0n ||
    value === 1n ||
    firstByte === 0xff ||
    firstByte === 0xfe && (first16 & 0xc000) === 0x8000 ||
    (first16 & 0xfe00) === 0xfc00 ||
    NON_PUBLIC_IPV6_PREFIXES.has(first32) ||
    (first16 === 0 && first32 === 0) && Number(value & 0xffffffffn) !== 0
  );
}
