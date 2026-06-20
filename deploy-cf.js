#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('开始自动部署到Cloudflare...');

try {
  // 安装依赖
  console.log('1. 安装依赖...');
  execSync('npm install', { stdio: 'inherit' });
  
  // 安装最新版本的wrangler
  console.log('2. 安装最新版本的wrangler...');
  execSync('npm install wrangler@latest --save-dev', { stdio: 'inherit' });
  
  // 部署到Cloudflare
  console.log('3. 部署到Cloudflare...');
  execSync('npx wrangler deploy', { stdio: 'inherit' });
  
  console.log('✅ 部署成功完成！');
} catch (error) {
  console.error('❌ 部署过程中发生错误:', error.message);
  process.exit(1);
} 