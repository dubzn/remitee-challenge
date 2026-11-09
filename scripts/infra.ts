import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devProject = 'remitee-local';
const action = process.argv[2];
const checkProject = process.env.REMITEE_CHECK_PROJECT;
if (checkProject && !/^remitee-check-[a-z0-9-]+$/.test(checkProject)) {
  throw new Error(
    'REMITEE_CHECK_PROJECT must start with remitee-check- and contain lowercase letters, digits or hyphens',
  );
}

function compose(project: string, args: string[], capture = false, input?: string) {
  const files = ['-f', 'compose.yaml'];
  if (project === devProject) files.push('-f', 'compose.local.yaml');
  const result = spawnSync(
    'docker',
    ['compose', '--project-directory', root, ...files, '-p', project, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: capture ? 'pipe' : ['pipe', 'inherit', 'inherit'],
      input,
      timeout: args[0] === 'build' ? 300_000 : 120_000,
    },
  );
  if (result.error) throw result.error;
  if (!capture && result.status !== 0)
    throw new Error(`Compose ${args[0]} failed (${result.status})`);
  return result;
}

function tools(project: string, script: string, capture = false) {
  return compose(
    project,
    ['run', '--rm', '--no-deps', '-T', 'tools', 'node', `scripts/${script}.ts`],
    capture,
  );
}

function up(project: string) {
  if (project === devProject) {
    const existing = compose(project, ['ps', '--all', '--format', 'json'], true);
    if (existing.status !== 0)
      throw new Error(existing.stderr || 'Cannot inspect local containers');
    const services = (existing.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .flatMap(
        (line) =>
          JSON.parse(line) as
            | { Service: string; State: string; Health: string }
            | { Service: string; State: string; Health: string }[],
      );
    const volumes = spawnSync(
      'docker',
      [
        'volume',
        'ls',
        '--filter',
        `label=com.docker.compose.project=${project}`,
        '--format',
        '{{.Name}}',
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
    if (volumes.error || volumes.status !== 0) throw new Error('Cannot inspect local volumes');
    if (services.length || volumes.stdout.trim()) {
      const running = ['anvil', 'postgres'].every((name) =>
        services.some((s) => s.Service === name && s.State === 'running' && s.Health === 'healthy'),
      );
      if (!running)
        throw new Error(
          'Local data/containers already exist but both services are not healthy and running. Anvil is ephemeral. Run npm run infra:reset explicitly, then infra:up. Existing data has not been deleted.',
        );
      compose(project, ['build', 'tools']);
      console.log(
        'Reusing running local services; apply service configuration changes through explicit infra:reset.',
      );
      return;
    }
  }
  compose(project, ['build', 'tools']);
  compose(project, ['up', '-d', '--wait', '--wait-timeout', '60', 'anvil', 'postgres']);
}

function clean(project: string) {
  compose(project, ['down', '--volumes', '--remove-orphans']);
}

function test() {
  const project = checkProject ?? `remitee-check-${process.pid}-${randomBytes(4).toString('hex')}`;
  console.log(`Foundation test project: ${project} (no published host ports)`);
  let failed = false;
  try {
    up(project);
    compose(project, ['exec', '-T', 'anvil', 'forge', '--version']);
    tools(project, 'probe');
    tools(project, 'smoke');
    compose(project, ['stop', 'postgres']);
    const negative = tools(project, 'probe', true);
    const output = `${negative.stdout ?? ''}\n${negative.stderr ?? ''}`;
    assert.equal(negative.status, 1, `Unavailable DB must exit 1: ${output}`);
    assert.match(output, /RPC_READY/);
    assert.match(output, /DB_UNAVAILABLE/);
    console.log('PASS stopped PostgreSQL produces DB_UNAVAILABLE and exit 1');
    compose(project, ['up', '-d', '--wait', '--wait-timeout', '60', 'postgres']);
    tools(project, 'probe');
  } catch (error) {
    failed = true;
    console.error('Original foundation failure:', error);
    try {
      const logs = compose(project, ['logs', '--no-color', '--tail', '60'], true);
      console.error(logs.stdout, logs.stderr);
    } catch (logError) {
      console.error('Could not collect diagnostics:', logError);
    }
    throw error;
  } finally {
    try {
      clean(project);
    } catch (cleanupError) {
      if (!failed) {
        // biome-ignore lint/correctness/noUnsafeFinally: No primary failure is pending; report the cleanup failure.
        throw cleanupError;
      }
      console.error('Additional cleanup failure:', cleanupError);
    }
  }
}

try {
  switch (action) {
    case 'up':
      up(devProject);
      tools(devProject, 'probe');
      console.log(
        'Local foundation ready: RPC 127.0.0.1:8545; PostgreSQL 127.0.0.1:5432. No escrow/API deployed.',
      );
      break;
    case 'stop':
      compose(devProject, ['stop']);
      break;
    case 'reset':
      console.log(
        'Deleting only remitee-local containers, ephemeral chain and PostgreSQL data volume.',
      );
      clean(devProject);
      break;
    case 'probe':
      tools(devProject, 'probe');
      break;
    case 'test':
      test();
      break;
    case 'clean-check':
      if (!checkProject)
        throw new Error('REMITEE_CHECK_PROJECT is required for explicit CI cleanup');
      clean(checkProject);
      break;
    case 'sql': {
      const file = process.argv[3];
      if (!file) throw new Error('Usage: npm run db:sql -- db/migrations/<reviewed-file.sql>');
      const path = realpathSync(resolve(root, file));
      const within = relative(resolve(root, 'db/migrations'), path);
      if (within.startsWith('..') || isAbsolute(within) || !within.endsWith('.sql')) {
        throw new Error('SQL must be a reviewed .sql file inside db/migrations');
      }
      compose(
        devProject,
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-U',
          'remitee',
          '-d',
          'remitee',
          '--set',
          'ON_ERROR_STOP=1',
          '--single-transaction',
          '--file',
          '-',
        ],
        false,
        readFileSync(path, 'utf8'),
      );
      break;
    }
    default:
      throw new Error('Expected up, stop, reset, probe, test, clean-check or sql');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Infrastructure command failed');
  process.exitCode = 1;
}
