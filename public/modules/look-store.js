const name = "simplestream-avatar-looks";
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("looks", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listLooks() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("looks").objectStore("looks").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function saveLook(look) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("looks", "readwrite");
      tx.objectStore("looks").put({
        ...look,
        version: 1,
        updatedAt: Date.now(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteLook(id) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("looks", "readwrite");
      tx.objectStore("looks").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
