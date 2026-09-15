
export async function calculateHash(data: any): Promise<string> {
  const str = JSON.stringify(data);
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function generateFileHash(file: File | Blob | ArrayBuffer | Uint8Array | string | any): Promise<string> {
  let arrayBuffer: ArrayBuffer;
  if (typeof file === 'string') {
    arrayBuffer = new TextEncoder().encode(file).buffer;
  } else if (file instanceof ArrayBuffer) {
    arrayBuffer = file;
  } else if (file instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(file))) {
    arrayBuffer = (file as Uint8Array).buffer.slice((file as Uint8Array).byteOffset, (file as Uint8Array).byteOffset + (file as Uint8Array).byteLength);
  } else if (file && typeof (file as any).arrayBuffer === 'function') {
    arrayBuffer = await (file as any).arrayBuffer();
  } else {
    arrayBuffer = new TextEncoder().encode(String(file)).buffer;
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
