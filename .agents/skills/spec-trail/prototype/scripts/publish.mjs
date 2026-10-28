#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepare, register, recover, associate } from "./publishing.mjs";
import { uploadToOpenFolio } from "./openfolio-client.mjs";
try {
  const [command, ...args] = process.argv.slice(2);
  const { values: v } = parseArgs({
    args,
    options: Object.fromEntries(
      [
        "repo",
        "directory",
        "entries",
        "repository",
        "out",
        "request",
        "result",
        "change",
        "git-entry",
        'package', 'entry', 'upload-url', 'openfolio-url',
      ].map((k) => [k, { type: "string" }]),
    ),
    strict: true,
  });
  const root = resolve(v.repo ?? "."),
    read = (p) => JSON.parse(readFileSync(p, "utf8"));
  if (command === "prepare") {
    const request = prepare(root, v.directory, read(v.entries), v.repository, v.package);
    writeFileSync(v.out, JSON.stringify(request, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      "Prepared publication request; invoke your host adapter to upload it.",
    );
  } else if (command === "upload") {
    await uploadToOpenFolio(root, { requestPath: v.request, resultPath: v.result, change: v.change,uploadUrl:v['upload-url'],openfolioUrl:v['openfolio-url'] });
    console.log("Published and registered locally. Commit and push the references.");
  } else if (command === "register") {
    register(root, {
      change: v.change,
      packagePath:v.package,repository:v.repository,
      ...(v["git-entry"]
        ? { gitEntry: v["git-entry"] }
        : { request: read(v.request), result: read(v.result) }),
    });
    console.log(
      "Registered locally. Commit and push references; main changes only after merge.",
    );
    if(v.package!==undefined || (!v['git-entry'] && Object.hasOwn(read(v.request),'packagePath')))console.log('Commit the frontend catalog, then run associate in the parent and commit its gitlink and Change together.');
  } else if(command==='associate'){
    associate(root,{change:v.change,entry:v.entry});
    console.log('Associated the committed frontend publication. Stage the gitlink and Change snapshots, then commit the parent once.');
  } else if (command === "recover") {
    recover(root);
    console.log("Restored references from the interrupted transaction.");
  } else
    throw Error(
      "Use prepare, upload (OpenFolio), register, associate or recover.",
    );
} catch (e) {
  console.error(`Prototype publication: ${e.message}`);
  process.exitCode = 1;
}
