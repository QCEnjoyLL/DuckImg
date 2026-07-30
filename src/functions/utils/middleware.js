/**
 * 错误处理中间件
 */
export async function errorHandling(c) {
    // 这里可以添加全局错误处理逻辑
    // 例如检查请求来源、IP限制等
    return;
}

/**
 * 遥测数据中间件（热路径保持安静，避免无用 CPU/日志成本）
 */
export function telemetryData(_c) {
    return;
} 