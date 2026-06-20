/**
 * 最小 SMTP 客户端（基于 Cloudflare Workers 原生 TCP: cloudflare:sockets）
 * 支持：隐式 TLS(465) / STARTTLS(587) / 明文(25)，AUTH LOGIN，UTF-8 HTML 邮件。
 */
import { connect } from 'cloudflare:sockets';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 将字符串按 UTF-8 编码为 base64（用于邮件头/正文及 AUTH）
function toBase64(str) {
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// RFC 2047 编码邮件头中的非 ASCII（标题、发件人名）
function encodeHeader(str) {
  if (!str) return '';
  // 仅 ASCII 直接返回
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return `=?UTF-8?B?${toBase64(str)}?=`;
}

// 正文 base64 按 76 字符换行
function wrapBase64(b64) {
  return b64.replace(/(.{76})/g, '$1\r\n');
}

class SmtpConnection {
  constructor(socket) {
    this.socket = socket;
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
    this.buffer = '';
  }

  async close() {
    try { await this.writer.close(); } catch {}
    try { await this.reader.cancel(); } catch {}
    try { await this.socket.close(); } catch {}
  }

  async send(line) {
    await this.writer.write(encoder.encode(line + '\r\n'));
  }

  async sendRaw(data) {
    await this.writer.write(encoder.encode(data));
  }

  // 读取一条完整 SMTP 应答（处理多行 250-... 续行），带超时
  async readReply(timeoutMs = 15000) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP 读取超时')), timeoutMs));

    while (true) {
      // 检查 buffer 中是否已有完整应答
      const lines = this.buffer.split('\r\n');
      // 找到形如 "250 xxx"（第 4 个字符是空格）的末行
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\d{3} /.test(line)) {
          const code = parseInt(line.slice(0, 3), 10);
          const consumed = lines.slice(0, i + 1).join('\r\n').length + 2;
          const text = lines.slice(0, i + 1).join('\n');
          this.buffer = this.buffer.slice(consumed);
          return { code, text };
        }
      }

      // 继续读取
      const { value, done } = await Promise.race([this.reader.read(), timeout]);
      if (done) {
        if (this.buffer.length) {
          const m = this.buffer.match(/(\d{3})/);
          return { code: m ? parseInt(m[1], 10) : 0, text: this.buffer };
        }
        throw new Error('SMTP 连接已关闭');
      }
      this.buffer += decoder.decode(value, { stream: true });
    }
  }

  // 发送命令并校验期望状态码
  async command(line, expectedCode, timeoutMs) {
    await this.send(line);
    const reply = await this.readReply(timeoutMs);
    if (expectedCode && Math.floor(reply.code / 100) !== Math.floor(expectedCode / 100)) {
      throw new Error(`SMTP 命令失败 (${reply.code}): ${reply.text}`);
    }
    return reply;
  }
}

/**
 * 发送邮件。smtp 配置：{ host, port, username, password, encryption, fromAddress, fromName }
 * 返回 { success, error? }。整体带超时，绝不长时间挂起请求。
 */
export async function sendMail(smtp, msg) {
  return Promise.race([
    _sendMail(smtp, msg),
    new Promise((resolve) => setTimeout(
      () => resolve({ success: false, error: 'SMTP 发送超时（请检查主机/端口/加密方式）' }), 30000)),
  ]);
}

async function _sendMail(smtp, { to, subject, html }) {
  if (!smtp || !smtp.host || !smtp.fromAddress) {
    return { success: false, error: 'SMTP 配置不完整（缺少主机或发件地址）' };
  }

  const port = parseInt(smtp.port, 10) || 465;
  const encryption = smtp.encryption || (port === 465 ? 'ssl' : 'starttls');

  let conn;
  try {
    // 隐式 TLS(ssl) 用 secureTransport:'on'；其余先明文，STARTTLS 时再升级
    const secureTransport = encryption === 'ssl' ? 'on' : 'starttls';
    let socket = connect({ hostname: smtp.host, port }, { secureTransport, allowHalfOpen: false });
    conn = new SmtpConnection(socket);

    // 服务器问候
    await conn.readReply();

    const ehloHost = smtp.fromAddress.split('@')[1] || 'localhost';
    await conn.command(`EHLO ${ehloHost}`, 250);

    // STARTTLS 升级
    if (encryption === 'starttls') {
      await conn.command('STARTTLS', 220);
      // 升级前必须先释放读写锁，否则 startTls() 会因流被锁定而报错
      try { conn.writer.releaseLock(); } catch {}
      try { conn.reader.releaseLock(); } catch {}
      const secured = socket.startTls();
      socket = secured;
      conn.socket = secured;
      conn.writer = secured.writable.getWriter();
      conn.reader = secured.readable.getReader();
      conn.buffer = '';
      await conn.command(`EHLO ${ehloHost}`, 250);
    }

    // AUTH LOGIN
    if (smtp.username) {
      await conn.command('AUTH LOGIN', 334);
      await conn.command(toBase64(smtp.username), 334);
      await conn.command(toBase64(smtp.password || ''), 235);
    }

    // 信封
    await conn.command(`MAIL FROM:<${smtp.fromAddress}>`, 250);
    await conn.command(`RCPT TO:<${to}>`, 250);
    await conn.command('DATA', 354);

    // 邮件内容
    const fromName = smtp.fromName || '鸭鸭图床';
    const date = new Date().toUTCString();
    const headers = [
      `From: ${encodeHeader(fromName)} <${smtp.fromAddress}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${date}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ].join('\r\n');

    const body = wrapBase64(toBase64(html));
    // 结束以 <CRLF>.<CRLF>
    await conn.sendRaw(headers + '\r\n\r\n' + body + '\r\n.\r\n');
    const dataReply = await conn.readReply();
    if (Math.floor(dataReply.code / 100) !== 2) {
      throw new Error(`邮件发送被拒 (${dataReply.code}): ${dataReply.text}`);
    }

    try { await conn.send('QUIT'); } catch {}
    await conn.close();
    return { success: true };
  } catch (error) {
    console.error('SMTP 发送失败:', error);
    if (conn) { try { await conn.close(); } catch {} }
    return { success: false, error: error.message || 'SMTP 发送失败' };
  }
}
