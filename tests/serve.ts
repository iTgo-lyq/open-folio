import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { seed } from './seed.ts';
const f = await seed(), config = join(f.root, 'config.json');
await writeFile(config, JSON.stringify({ schemaVersion: 1, projects: [f.project], allowedOrigins: ['http://127.0.0.1:10682'] }));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '10682'], {stdio: 'inherit', env: {...process.env, OPENFOLIO_CONFIG: config, OPENFOLIO_DATA_DIR: join(f.root, 'cache'), OPENFOLIO_BUILD_DIR: '.next-e2e'} });
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {child.kill(signal);});
child.on('exit', async code => {await f.cleanup(); process.exit(code ?? 0);});
