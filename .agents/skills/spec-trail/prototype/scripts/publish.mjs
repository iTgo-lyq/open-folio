import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepare, register, recover, associate } from "./publishing.mjs";
import { uploadToOpenFolio } from "./openfolio-client.mjs";

const read = path => JSON.parse(readFileSync(path, "utf8"));

export async function runPrototypePublication(command, values) {
  const root = resolve(values.repo ?? ".");
  switch (command) {
    case "prepare": {
      const request = prepare(root, values.directory, read(values.entries), values.repository, values.package);
      writeFileSync(values.out, JSON.stringify(request, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      return { output: { requestId: request.requestId, path: values.out } };
    }
    case "upload": {
      const result = await uploadToOpenFolio(root, {
        requestPath: values.request,
        resultPath: values.result,
        change: values.change,
        uploadUrl: values["upload-url"],
        openfolioUrl: values["openfolio-url"],
      });
      return { output: result };
    }
    case "register": {
      const gitEntry = values["git-entry"];
      const hasFiles = values.request !== undefined || values.result !== undefined;
      if (gitEntry ? hasFiles : !values.request || !values.result)
        throw Error("Provide --git-entry or both --request and --result.");
      const request = gitEntry ? undefined : read(values.request);
      const entries = register(root, {
        change: values.change,
        packagePath: values.package,
        repository: values.repository,
        ...(gitEntry ? { gitEntry } : { request, result: read(values.result) }),
      });
      const standalone = values.package !== undefined || Object.hasOwn(request ?? {}, "packagePath");
      return { output: { registered: true, entries, ...(standalone && { next: "Commit the frontend catalog, then run prototype associate in the parent." }) } };
    }
    case "associate": {
      const entries = associate(root, { change: values.change, entry: values.entry });
      return { output: { associated: true, change: values.change, entries } };
    }
    case "recover":
      recover(root);
      return { output: { recovered: true } };
  }
}
