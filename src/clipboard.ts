/** Clipboard access varies across embedded browsers and insecure LAN origins. */
export async function copyInvite(input: HTMLInputElement): Promise<boolean> {
  // Copy while the click still has native user activation. Some embedded browsers
  // resolve writeText without forwarding the value to the system clipboard.
  input.focus();
  input.select();
  try {
    if (document.execCommand("copy")) return true;
  } catch {
    // Modern-only browsers can still use the asynchronous clipboard API.
  }
  if (navigator.clipboard?.writeText) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.clipboard.writeText(input.value),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Clipboard unavailable")),
            1500,
          );
        }),
      ]);
      return true;
    } catch {
      // Keep a selectable link available even when the embedded browser denies access.
    } finally {
      clearTimeout(timeout);
    }
  }
  return false;
}
