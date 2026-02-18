import { mountOverlay } from "./overlay/mount";
import { parseBaselineTask } from "./parser";

if (location.origin === "https://baseline.apple.com") {
  const task = parseBaselineTask();
  mountOverlay(task);
}