function dockUrl(value, appOrigin) {
  try {
    const url = new URL(value);
    if (
      url.origin === appOrigin ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
module.exports = { dockUrl };
