import { defineUniPages } from '@uni-helper/vite-plugin-uni-pages'

export default defineUniPages({
  // 路由由插件扫描 src/pages/** 自动生成，本文件只放全局配置与分包声明
  pages: [],
  globalStyle: {
    backgroundColor: '#F5F6F8',
    backgroundColorTop: '#FFFFFF',
    backgroundColorBottom: '#FFFFFF',
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTextStyle: 'black',
    navigationBarTitleText: '问卷',
    // 各页面使用自绘头部（与设计稿一致），因此全局关闭原生导航栏
    navigationStyle: 'custom',
  },
  // 分包：H5 不支持 subPackages（官方限制），如需启用请同时确认 H5 构建产物
  subPackages: [],
})
