#!/usr/bin/env node
// 统一打 Tag 脚本 - 所有工程共用核心逻辑
// 工程 package.json 声明了 "type": "module"，因此使用 .cjs 后缀以 CommonJS 运行

const fs = require('fs');
const { execFileSync } = require('child_process');

const versionFilePath = './dist/build/h5/version.json';

const parseArgs = (argv) => {
  const args = {};
  argv.forEach((arg) => {
    if (arg.startsWith('--')) {
      args[arg.slice(2)] = true;
    }
  });
  return args;
};

const runGit = (args, options = {}) => execFileSync('git', args, {
  stdio: options.stdio || 'pipe',
  cwd: options.cwd || process.cwd(),
});

const main = () => {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(versionFilePath)) {
    throw new Error(`未找到版本文件: ${versionFilePath}`);
  }

  const versionInfo = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
  if (!versionInfo.version || !versionInfo.build) {
    throw new Error('version.json 缺少 version 或 build 字段');
  }

  const tagName = `build/${versionInfo.version}`;
  // 限制描述长度，避免 git tag message 过长
  const rawDesc = versionInfo.description || versionInfo.tagDescription || '';
  const shortDesc = rawDesc.length > 500 ? rawDesc.slice(0, 500) + '...' : rawDesc;
  const message = [
    `Build ${versionInfo.version}`,
    '',
    `App: ${versionInfo.appName || versionInfo.app || 'unknown'}`,
    `Commit: ${versionInfo.build}`,
    `Commit time: ${versionInfo.commitTime || ''}`,
    `Build time: ${versionInfo.buildTime || ''}`,
    '',
    shortDesc,
  ].join('\n');

  try {
    runGit(['rev-parse', '-q', '--verify', `refs/tags/${tagName}`]);
    console.log(`构建标签已存在: ${tagName}`);
  } catch (e) {
    runGit(['tag', '-a', tagName, '-m', message], { stdio: 'inherit' });
    console.log(`构建标签创建成功: ${tagName}`);
  }

  if (args.push) {
    runGit(['push', 'origin', tagName], { stdio: 'inherit' });
    console.log(`构建标签推送成功: ${tagName}`);
  }
};

try {
  main();
} catch (error) {
  console.error(`创建构建标签失败: ${error.message}`);
  process.exit(1);
}
