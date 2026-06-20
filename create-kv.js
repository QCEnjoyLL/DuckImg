#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('创建 Cloudflare KV 命名空间...');

// 检查 Wrangler 是否已登录
function checkWranglerLogin() {
  try {
    console.log('检查 Wrangler 登录状态...');
    const whoamiOutput = execSync('npx wrangler whoami', { encoding: 'utf8' });
    console.log('Wrangler 已登录:', whoamiOutput);
    return true;
  } catch (error) {
    console.error('Wrangler 未登录，请先登录:', error.message);
    console.log('请运行 `npx wrangler login` 登录 Cloudflare 账号');
    return false;
  }
}

// 确保 Wrangler 已登录
if (!checkWranglerLogin()) {
  console.log('尝试自动登录...');
  try {
    execSync('npx wrangler login', { stdio: 'inherit' });
  } catch (error) {
    console.error('自动登录失败，请手动登录后再运行此脚本');
    process.exit(1);
  }
}

// 读取 wrangler.toml 文件
const wranglerTomlPath = path.join(process.cwd(), 'wrangler.toml');
let wranglerToml = fs.readFileSync(wranglerTomlPath, 'utf8');

// 提取现有的 KV 命名空间 ID
const imgUrlIdMatch = wranglerToml.match(/binding\s*=\s*"img_url"\s*\nid\s*=\s*"([^"]+)"/);
const usersIdMatch = wranglerToml.match(/binding\s*=\s*"users"\s*\nid\s*=\s*"([^"]+)"/);

const imgUrlId = imgUrlIdMatch ? imgUrlIdMatch[1] : null;
const usersId = usersIdMatch ? usersIdMatch[1] : null;

try {
  // 创建 img_url KV 命名空间（如果不存在）
  console.log('1. 检查 img_url KV 命名空间...');
  let newImgUrlId = imgUrlId;

  try {
    console.log('   执行命令: npx wrangler kv namespace list');
    // 检查 KV 命名空间是否存在
    const kvListOutput = execSync('npx wrangler kv namespace list', { encoding: 'utf8' });
    console.log('   KV 命名空间列表获取成功');
    console.log('   输出:', kvListOutput);
    const imgUrlExists = kvListOutput.includes('img_url');

    if (!imgUrlExists) {
      console.log('   img_url 命名空间不存在，正在创建...');
      console.log('   执行命令: npx wrangler kv namespace create "img_url"');
      const createOutput = execSync('npx wrangler kv namespace create "img_url"', { encoding: 'utf8' });
      console.log('   创建成功！');
      console.log('   输出:', createOutput);

      // 提取新创建的 KV 命名空间 ID
      const idMatch = createOutput.match(/id\s*=\s*"([^"]+)"/);
      if (idMatch) {
        newImgUrlId = idMatch[1];
        console.log(`   新的 img_url KV 命名空间 ID: ${newImgUrlId}`);
      }
    } else {
      console.log('   img_url 命名空间已存在。');

      // 如果命名空间存在但 ID 不存在，尝试获取 ID
      if (!newImgUrlId) {
        try {
          // 尝试解析JSON格式的输出
          const namespaces = JSON.parse(kvListOutput);
          const imgUrlNamespace = namespaces.find(ns => ns.title === 'img_url');
          if (imgUrlNamespace) {
            newImgUrlId = imgUrlNamespace.id;
            console.log(`   找到 img_url KV 命名空间 ID: ${newImgUrlId}`);
          }
        } catch (error) {
          console.error('   解析KV命名空间列表失败:', error);
          // 尝试使用正则表达式匹配
          const kvInfo = kvListOutput.split('\n').find(line => line.includes('img_url'));
          if (kvInfo) {
            const idMatch = kvInfo.match(/id:\s*([a-f0-9]+)/);
            if (idMatch) {
              newImgUrlId = idMatch[1];
              console.log(`   找到 img_url KV 命名空间 ID: ${newImgUrlId}`);
            }
          }
        }
      }
    }

    // 更新 wrangler.toml 文件中的 img_url KV 命名空间 ID
    if (newImgUrlId && newImgUrlId !== imgUrlId) {
      wranglerToml = wranglerToml.replace(
        /binding\s*=\s*"img_url"\s*\nid\s*=\s*"[^"]*"/,
        `binding = "img_url"\nid = "${newImgUrlId}"`
      );
      console.log(`   已更新 wrangler.toml 文件中的 img_url KV 命名空间 ID。`);
    }
  } catch (error) {
    console.error('   检查/创建 img_url 命名空间时出错:', error.message);
  }

  // 创建 users KV 命名空间（如果不存在）
  console.log('2. 检查 users KV 命名空间...');
  let newUsersId = usersId;

  try {
    console.log('   执行命令: npx wrangler kv namespace list');
    // 检查 KV 命名空间是否存在
    const kvListOutput = execSync('npx wrangler kv namespace list', { encoding: 'utf8' });
    console.log('   KV 命名空间列表获取成功');
    console.log('   输出:', kvListOutput);
    const usersExists = kvListOutput.includes('users');

    if (!usersExists) {
      console.log('   users 命名空间不存在，正在创建...');
      console.log('   执行命令: npx wrangler kv namespace create "users"');
      const createOutput = execSync('npx wrangler kv namespace create "users"', { encoding: 'utf8' });
      console.log('   创建成功！');
      console.log('   输出:', createOutput);

      // 提取新创建的 KV 命名空间 ID
      const idMatch = createOutput.match(/id\s*=\s*"([^"]+)"/);
      if (idMatch) {
        newUsersId = idMatch[1];
        console.log(`   新的 users KV 命名空间 ID: ${newUsersId}`);
      }
    } else {
      console.log('   users 命名空间已存在。');

      // 如果命名空间存在但 ID 不存在，尝试获取 ID
      if (!newUsersId) {
        try {
          // 尝试解析JSON格式的输出
          const namespaces = JSON.parse(kvListOutput);
          const usersNamespace = namespaces.find(ns => ns.title === 'users');
          if (usersNamespace) {
            newUsersId = usersNamespace.id;
            console.log(`   找到 users KV 命名空间 ID: ${newUsersId}`);
          }
        } catch (error) {
          console.error('   解析KV命名空间列表失败:', error);
          // 尝试使用正则表达式匹配
          const kvInfo = kvListOutput.split('\n').find(line => line.includes('users'));
          if (kvInfo) {
            const idMatch = kvInfo.match(/id:\s*([a-f0-9]+)/);
            if (idMatch) {
              newUsersId = idMatch[1];
              console.log(`   找到 users KV 命名空间 ID: ${newUsersId}`);
            }
          }
        }
      }
    }

    // 更新 wrangler.toml 文件中的 users KV 命名空间 ID
    if (newUsersId && newUsersId !== usersId) {
      wranglerToml = wranglerToml.replace(
        /binding\s*=\s*"users"\s*\nid\s*=\s*"[^"]*"/,
        `binding = "users"\nid = "${newUsersId}"`
      );
      console.log(`   已更新 wrangler.toml 文件中的 users KV 命名空间 ID。`);
    }
  } catch (error) {
    console.error('   检查/创建 users 命名空间时出错:', error.message);
  }

  // 保存更新后的 wrangler.toml 文件
  fs.writeFileSync(wranglerTomlPath, wranglerToml);
  console.log('✅ KV 命名空间检查/创建完成！wrangler.toml 文件已更新。');
} catch (error) {
  console.error('❌ 创建 KV 命名空间过程中发生错误:', error.message);
  process.exit(1);
}
