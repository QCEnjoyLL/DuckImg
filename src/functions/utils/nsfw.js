/**
 * 图片鉴黄（NSFW）工具函数
 * 通用可配置接口：支持 URL（GET / POST JSON）或文件直传（POST_FILE Multipart），按返回分数与阈值判定。
 */

const NSFW_TIMEOUT_MS = 15000;

function createTimeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(NSFW_TIMEOUT_MS);
  }
  return undefined;
}

/**
 * 按点路径从对象取值，如 "nudity.raw" -> obj.nudity.raw
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
}

function appendExtraParams(urlObj, extraParams) {
  if (!extraParams) return;
  for (const pair of extraParams.split('&')) {
    const idx = pair.indexOf('=');
    if (idx > 0) urlObj.searchParams.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

/**
 * 调用鉴黄接口判定图片是否违规。
 * 返回 { flagged: boolean, score: number|null, error?: string }。
 * 设计原则：鉴黄服务故障时返回 error，由调用方按 failurePolicy（allow / block）决定放行或拦截。
 */
export async function moderateImage(imageUrl, settings, uploadFile = null) {
  const nsfw = settings && settings.nsfw;
  if (!nsfw || !nsfw.enabled || !nsfw.apiUrl) {
    return { flagged: false, score: null };
  }

  // 仅允许 http(s) 鉴黄端点，防止管理员配置被污染后 SSRF 到内网
  let parsedUrl;
  try {
    parsedUrl = new URL(nsfw.apiUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { flagged: false, score: null, error: '鉴黄接口仅支持 http(s)' };
    }
  } catch {
    return { flagged: false, score: null, error: '鉴黄接口 URL 无效' };
  }

  const method = (nsfw.method || 'POST').toUpperCase();
  const imageParam = nsfw.imageParam || (method === 'POST_FILE' ? 'file' : 'url');
  const scorePath = nsfw.scorePath || 'score';
  const threshold = typeof nsfw.threshold === 'number' ? nsfw.threshold : 0.8;
  const extraParams = nsfw.extraParams || ''; // 形如 "key=xxx" 或 "api_user=..&api_secret=.."
  const signal = createTimeoutSignal();

  try {
    let res;
    if (method === 'POST_FILE') {
      if (!uploadFile) {
        return { flagged: false, score: null, error: '缺少待审核图片文件' };
      }
      const u = new URL(parsedUrl.toString());
      appendExtraParams(u, extraParams);
      const formData = new FormData();
      const safeFileName = (uploadFile && uploadFile.name) || 'image';
      formData.append(imageParam, uploadFile, safeFileName);
      const headers = {};
      if (nsfw.apiKey) headers['Authorization'] = `Bearer ${nsfw.apiKey}`;
      res = await fetch(u.toString(), {
        method: 'POST',
        headers,
        body: formData,
        ...(signal ? { signal } : {}),
      });
    } else if (method === 'GET') {
      // GET：把图片URL与附加参数拼到查询串（适配 ModerateContent / Sightengine 等免费服务）
      const u = new URL(parsedUrl.toString());
      u.searchParams.set(imageParam, imageUrl);
      appendExtraParams(u, extraParams);
      const headers = {};
      if (nsfw.apiKey) headers['Authorization'] = `Bearer ${nsfw.apiKey}`;
      res = await fetch(u.toString(), {
        method: 'GET',
        headers,
        ...(signal ? { signal } : {}),
      });
    } else {
      const headers = { 'Content-Type': 'application/json' };
      if (nsfw.apiKey) headers['Authorization'] = `Bearer ${nsfw.apiKey}`;
      res = await fetch(parsedUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ [imageParam]: imageUrl }),
        ...(signal ? { signal } : {}),
      });
    }

    if (!res.ok) {
      console.error('鉴黄接口返回错误:', res.status);
      return { flagged: false, score: null, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const rawScore = getByPath(data, scorePath);
    const score = typeof rawScore === 'number' ? rawScore : parseFloat(rawScore);

    if (Number.isNaN(score)) {
      console.error('鉴黄接口未返回有效分数, scorePath:', scorePath);
      return { flagged: false, score: null, error: '无法解析分数' };
    }

    return { flagged: score >= threshold, score };
  } catch (error) {
    console.error('鉴黄接口调用失败:', error);
    return { flagged: false, score: null, error: '鉴黄服务调用失败' };
  }
}
