import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { kvPut } from '../src/functions/utils/db.js';
import { resetSettingsCacheForTests } from '../src/functions/utils/settings.js';

beforeEach(() => resetSettingsCacheForTests());

async function preview(id = 'preview-test.png') {
  const response = await exports.default.fetch(`https://duckimg.test/file/${encodeURIComponent(id)}?preview=true`);
  return { response, html: await response.text() };
}

describe('preview appearance and branding', () => {
  it.each(['/images/custom-logo.png', 'images/custom-logo.png'])('reuses the main theme/palette managers and configured branding: %s', async logoUrl => {
    await kvPut(env, 'config:settings', { site: { siteName: 'Test Gallery', logoUrl } });
    const { response, html } = await preview();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('<title>图片预览 - Test Gallery</title>');
    expect(html).toContain('src="https://duckimg.test/images/custom-logo.png"');
    expect(html).toContain('<span class="brand-name">Test Gallery</span>');
    expect(html).toContain('href="https://duckimg.test/images/custom-logo.png"');
    for (const path of ['/css/tokens.css', '/js/theme-manager.js', '/js/palettes.js', '/js/preview-appearance.js']) {
      expect(html).toContain(path);
    }
    expect(html).toContain('data-early-theme');
    expect(html).not.toContain('background: linear-gradient(135deg, #0f0f23');
    expect(html).not.toContain('class="brand-icon"');
  });

  it('escapes configured branding and rejects unsafe logo schemes', async () => {
    await kvPut(env, 'config:settings', {
      site: { siteName: '"><img src=x onerror=alert(1)>', logoUrl: 'javascript:alert(1)' },
    });
    const { html } = await preview();
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain('src="/images/logo.svg"');
  });

  it('does not allow file IDs to break out of the inline preview script', async () => {
    const { html } = await preview('a</script><script>alert(1)</script>.png');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('\\u003c/script>');
  });
});
