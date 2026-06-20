/**
 * 错误处理中间件
 */
export async function errorHandling(c) {
    // 这里可以添加全局错误处理逻辑
    // 例如检查请求来源、IP限制等
    return;
}

/**
 * 遥测数据中间件
 */
export function telemetryData(c) {
    // 可以在这里添加统计或分析代码
    const timestamp = Date.now();
    const url = new URL(c.req.url);
    const userAgent = c.req.headers.get('User-Agent') || 'unknown';
    
    console.log(`[${timestamp}] 请求: ${url.pathname} - UA: ${userAgent}`);
    return;
} 