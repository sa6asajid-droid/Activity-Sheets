/** Seed the demo samples into the configured data directory (CS_DATA_DIR or ./data). */
import { SqliteStore } from "../src/lib/db/store";
import { getConfig } from "../src/lib/config";
import { seedSamples } from "../src/lib/samples";
import { browserLayoutEngine, closeBrowser } from "../src/lib/render/browser";

const store = new SqliteStore(getConfig().dbFile);
const force = process.argv.includes("--force");
const r = await seedSamples(store, browserLayoutEngine, { force });
console.log(r.created ? `Seeded ${r.created} demo projects into ${getConfig().dbFile}` : "Samples already present (use --force to add another copy).");
await closeBrowser();
