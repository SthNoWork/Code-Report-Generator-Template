export async function readTextFromHandle(handle) {
  try {
    return await (await handle.getFile()).text();
  } catch {
    return '';
  }
}

export async function readImageDataUrlFromHandle(handle) {
  return readDataUrlFromHandle(handle);
}

export async function readDataUrlFromHandle(handle) {
  try {
    const file = await handle.getFile();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result || '');
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    });
  } catch {
    return '';
  }
}
