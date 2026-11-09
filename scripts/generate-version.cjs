// scripts/generate-version.cjs
// 统一版本生成脚本 - 所有工程共用核心逻辑
// 工程 package.json 声明了 "type": "module"，因此使用 .cjs 后缀以 CommonJS 运行
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 解析命令行参数
const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const rawArg = arg.slice(2);
    const equalIndex = rawArg.indexOf('=');
    const rawKey = equalIndex === -1 ? rawArg : rawArg.slice(0, equalIndex);
    const rawValue = equalIndex === -1 ? undefined : rawArg.slice(equalIndex + 1);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (rawValue !== undefined) {
      args[key] = rawValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
};

const cliArgs = parseArgs(process.argv.slice(2));

// 获取 Git 信息
const getGitInfo = () => {
  try {
    const commitHash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
    const commitTime = execSync('git log -1 --format=%cd --date=iso', { stdio: 'pipe' }).toString().trim();
    return { commitHash, commitTime };
  } catch (e) {
    return { commitHash: 'unknown', commitTime: '' };
  }
};

// 获取 package.json 信息
const getPackageInfo = () => {
  try {
    const pkg = require('../package.json');
    return { name: pkg.name || 'unknown', version: pkg.version || '0.0.0' };
  } catch (e) {
    return { name: 'unknown', version: '0.0.0' };
  }
};

// 格式化日期为 YYMMDDHHmm
const formatDateTime = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
};

// 格式化构建时间
const formatBuildTime = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

// 生成版本号 - 统一使用 V{YYMMDDHHmm} 格式
const generateVersion = () => {
  return `V${formatDateTime()}`;
};

// 获取自动描述：上次 tag 到 HEAD 的提交日志
const getAutoDescription = () => {
  try {
    // 获取最近的 tag
    const latestTag = execSync('git describe --tags --abbrev=0', { stdio: 'pipe' }).toString().trim();
    // 获取 tag 到 HEAD 的提交日志
    const logs = execSync(`git log ${latestTag}..HEAD --pretty=format:"%h %s" --no-merges`, { stdio: 'pipe' }).toString().trim();
    return logs || '暂无更新描述';
  } catch (e) {
    // 没有 tag 时获取最近 10 条提交
    try {
      return execSync('git log -10 --pretty=format:"%h %s" --no-merges', { stdio: 'pipe' }).toString().trim();
    } catch (e2) {
      return '暂无更新描述';
    }
  }
};

// 获取描述
const getDescription = () => {
  // 命令行参数优先
  if (cliArgs.desc !== undefined) {
    if (cliArgs.desc === 'auto') return getAutoDescription();
    if (cliArgs.desc === 'none') return '';
    return cliArgs.desc;
  }
  // 环境变量次之
  if (process.env.VERSION_DESCRIPTION !== undefined) {
    return process.env.VERSION_DESCRIPTION;
  }
  // 默认自动生成
  return getAutoDescription();
};

// 主函数
const main = () => {
  // uni-app H5 构建产物目录
  const outDir = cliArgs.out || './dist/build/h5';
  const appName = cliArgs.appName || '问卷调查';
  const appId = cliArgs.app || getPackageInfo().name;

  const { commitHash, commitTime } = getGitInfo();
  const version = generateVersion();

  const versionInfo = {
    app: appId,
    appName: appName,
    version: version,
    versionMode: 'date',
    build: commitHash,
    commitTime: commitTime,
    buildTime: formatBuildTime(),
    description: getDescription()
  };

  // 确保输出目录存在
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'version.json');
  fs.writeFileSync(outPath, JSON.stringify(versionInfo, null, 2), 'utf8');

  console.log(`✅ 版本文件生成成功: ${outPath}`);
  console.log(JSON.stringify(versionInfo, null, 2));
};

main();
