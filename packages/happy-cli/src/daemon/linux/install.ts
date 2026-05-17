import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { logger } from '@/ui/logger';
import { trimIdent } from '@/utils/trimIdent';
import { projectPath } from '@/projectPath';

const SERVICE_NAME = 'happy-daemon.service';

export async function install(): Promise<void> {
    const runtime = process.execPath;
    const entrypoint = path.join(projectPath(), 'dist', 'index.mjs');

    if (!existsSync(entrypoint)) {
        throw new Error(`Entrypoint not found: ${entrypoint}. Please build the project first.`);
    }

    const homedir = os.homedir();
    const serviceDir = path.join(homedir, '.config', 'systemd', 'user');
    const servicePath = path.join(serviceDir, SERVICE_NAME);

    // systemd user services start with a minimal PATH (typically /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin),
    // so carry over the current shell's PATH so the daemon can find CLIs installed via npm-global, nvm, bun, etc.
    const userPath = (process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
        .replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const serviceContent = trimIdent(`
        [Unit]
        Description=Happy Next CLI Daemon
        After=network-online.target
        Wants=network-online.target

        [Service]
        Type=simple
        ExecStart=${runtime} --no-warnings --no-deprecation ${entrypoint} daemon start-sync
        Restart=on-failure
        RestartSec=30
        Environment=HOME=${homedir}
        Environment="PATH=${userPath}"

        [Install]
        WantedBy=default.target
    `);

    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(servicePath, serviceContent + '\n');

    logger.info(`Created systemd user service at ${servicePath}`);

    try {
        execSync('systemctl --user daemon-reload', { stdio: 'pipe' });
        execSync(`systemctl --user enable --now ${SERVICE_NAME}`, { stdio: 'pipe' });
    } catch (error) {
        // Surface systemctl's real stderr so users can diagnose. The most common failure on
        // servers/containers is 'No medium found' — meaning no user systemd instance — usually
        // fixed by `sudo loginctl enable-linger $USER` then re-logging in.
        const execError = error as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer };
        const details = [
            execError.stderr?.toString().trim(),
            execError.stdout?.toString().trim(),
        ].filter(Boolean).join('\n');
        const username = os.userInfo().username || process.env.USER || '$USER';
        const hint = /No medium found|Failed to connect to bus/i.test(details)
            ? `\n\nNo user systemd instance is running. Try:\n  sudo loginctl enable-linger ${username}\nThen log out and back in, and re-run \`happy daemon enable\`.`
            : '\n\nTry: systemctl --user status';
        throw new Error(`Failed to enable systemd service:\n${details || '(no output from systemctl)'}${hint}`);
    }

    logger.info('Daemon enabled and started. It will auto-start on login.');
    logger.info('To disable: happy daemon disable');
}
