import type { Design } from "./types";

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const blob = new Blob([data as BlobPart]);
  const buf = await new Response(blob.stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const blob = new Blob([data as BlobPart]);
  const buf = await new Response(blob.stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeDesign(design: Design): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(design));
  try {
    return b64urlEncode(await gzip(json));
  } catch {
    return b64urlEncode(json);
  }
}

export async function decodeDesign(code: string): Promise<Design | null> {
  try {
    const bytes = b64urlDecode(code);
    let text: string;
    try {
      text = new TextDecoder().decode(await gunzip(bytes));
    } catch {
      text = new TextDecoder().decode(bytes);
    }
    return JSON.parse(text) as Design;
  } catch {
    return null;
  }
}
