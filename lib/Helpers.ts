const DEC2HEX = (() => {
  const alphabet = '0123456789abcdef';
  const dec2hex16 = [...alphabet];
  const dec2hex256 = new Array<string> (256);

  for (let i = 0; i < 256; i++) {
    dec2hex256[i] = `${dec2hex16[(i >>> 4) & 0xF]}${dec2hex16[i & 0xF]}`;
  }

  return dec2hex256;
})();

const HEX2DEC = (() => {
  const hex2dec: Record<string, number> = {};

  for ( let i = 0; i < 256; i++ ) {
    const hex = DEC2HEX[i];
    const firstLower = hex[0];
    const firstUpper = firstLower.toUpperCase();
    const lastLower = hex[1];
    const lastUpper = lastLower.toUpperCase();

    hex2dec[hex] = i;
    hex2dec[`${firstLower}${lastUpper}`] = i;
    hex2dec[`${firstUpper}${lastLower}`] = i;
    hex2dec[`${firstUpper}${lastUpper}`] = i;
  }

  return hex2dec;
})();

export function uint8ArrayConcat(arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for(const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

export function hexToUint8Array(hexString: string, maxLength?: number): Uint8Array {
  const length = maxLength ?? hexString.length / 2;
  const result = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    result[i] = HEX2DEC[hexString.slice (i * 2, (i * 2) + 2)];
  }

  return result;
}
