import { rotateWorkspaceKeys } from "../src/server/workspace-key-rotation.ts";
const [source, prepared, credential] = process.argv.slice(2);
if (!source || !prepared || process.argv.length > 5) {
  process.stderr.write(
    "Usage: node --conditions=react-server scripts/rotate-workspace-keys.ts <personal> <prepared-directory> [old-credential-key-file]\n",
  );
  process.exitCode = 1;
} else {
  try {
    await rotateWorkspaceKeys(source, prepared, credential);
    process.stdout.write(
      "Prepared replacement keys and state; source and cache ids preserved. Install only while the service is stopped.\n",
    );
  } catch {
    process.stderr.write(
      "Rotation failed; source preserved. Verify the stopped service, matching keys/state and empty destination.\n",
    );
    process.exitCode = 1;
  }
}
