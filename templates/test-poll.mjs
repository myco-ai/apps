// Playwright 1.57 treats a Promise as truthy in waitForFunction's predicate.
// Await browser-side asynchronous reads in Node before testing their value.
export async function waitForPage(page, predicate, arg, { timeout = 15000, interval = 50 } = {}) {
  const deadline = performance.now() + timeout;
  do {
    const value = await page.evaluate(predicate, arg);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, interval));
  } while (performance.now() < deadline);
  throw new Error(`Timed out waiting for asynchronous page condition: ${predicate}`);
}
