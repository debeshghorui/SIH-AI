import { pullSandboxImages, SANDBOX_IMAGES } from "../src/tools/sandbox";

/**
 * Venue pre-pull. Run once while online (or from an air-gapped image cache):
 *   bun run sandbox:prepull
 */
const start = Date.now();
console.log(`pre-pull ${SANDBOX_IMAGES.join(", ")}`);
try {
  await pullSandboxImages((image, status) => {
    console.log(`  ${image}: ${status}`);
  });
  console.log(`done in ${Date.now() - start}ms`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
