const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const projectRoot = path.resolve(__dirname, '..');
const moduleRoot = path.join(projectRoot, 'node_modules', 'better-sqlite3');
const defaultNodeExecPath = process.env.npm_node_execpath || process.execPath;
const localBin = path.join(projectRoot, 'node_modules', '.bin');
let runtimeNodeExecPath = defaultNodeExecPath;

function rebuildBetterSqlite3() {
  const result = spawnSync('sh', ['-c', 'prebuild-install || node-gyp rebuild --release'], {
    cwd: moduleRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${path.dirname(nodeExecPath)}${path.delimiter}${localBin}${path.delimiter}${process.env.PATH || ''}`,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canLoadBetterSqlite3(nodePath) {
  const result = spawnSync(
    nodePath,
    ['-e', "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close();"],
    {
      cwd: projectRoot,
      stdio: 'pipe',
      env: process.env,
    }
  );

  return result.status === 0;
}

try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.close();
} catch (error) {
  if (!String(error && error.message).includes('NODE_MODULE_VERSION')) {
    throw error;
  }

  const fallbackNodes = ['/opt/homebrew/bin/node', '/usr/local/bin/node'].filter(
    (candidate) => candidate !== defaultNodeExecPath && fs.existsSync(candidate)
  );

  const matchingNode = fallbackNodes.find(canLoadBetterSqlite3);

  if (matchingNode) {
    runtimeNodeExecPath = matchingNode;
    console.warn(`Using ${matchingNode} for the backend because better-sqlite3 is built for that Node.js runtime.`);
  } else {
    console.warn('Rebuilding better-sqlite3 for the active Node.js version...');
    rebuildBetterSqlite3();
  }
}

const child = spawn(runtimeNodeExecPath, ['index.js'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
