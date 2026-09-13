/**
 * 部署配置一致性测试。
 *
 * 背景：`src/index.js` 用 `event.cron === BACKUP_CRON` 分流定时任务，而 cron 表达式
 * 声明在 `wrangler.toml` 的 [triggers].crons 里。两者一旦不一致，
 * **备份分支永远不会命中** —— 只会跑一次无害的清理，即"备份静默完全停摆"，
 * 而这件事此前只靠源码注释提醒。
 *
 * 注意：测试跑在 workerd 里，**看不到真实文件系统**（读到的是 /bundle/…），
 * 所以这些配置内容由 vitest.config.mjs 在 Node 侧读好后经 bindings 注入。
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('wrangler.toml ↔ 源码常量一致性', () => {
  it('BACKUP_CRON 出现在 wrangler.toml 的 crons 列表里', () => {
    const backupCron = env.CFG_BACKUP_CRON;
    const crons = env.CFG_CRONS;

    expect(backupCron, 'src/index.js 里没解析到 BACKUP_CRON').toBeTruthy();
    expect(Array.isArray(crons) && crons.length > 0, 'wrangler.toml 里没解析到 crons').toBe(true);

    expect(
      crons,
      `BACKUP_CRON="${backupCron}" 不在 wrangler.toml 的 crons ${JSON.stringify(crons)} 中：`
      + '备份分支将永远不会命中，备份会静默停摆。',
    ).toContain(backupCron);

    // 顺带防住手写逗号造成的空项
    expect(crons.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });

  it('wrangler.toml 的 D1 绑定与迁移目录与代码约定一致', () => {
    const toml = env.CFG_WRANGLER_TOML;
    expect(toml).toMatch(/binding\s*=\s*"DB"/);
    expect(toml).toMatch(/database_name\s*=\s*"duckimg"/);
    expect(toml).toMatch(/migrations_dir\s*=\s*"migrations"/);
  });
});
