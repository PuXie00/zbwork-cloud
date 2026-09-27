import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from '../locales/zh.json';
import en from '../locales/en.json';

i18n
  // 检测用户当前使用的语言
  // 文档: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // 注入 react-i18next 实例
  .use(initReactI18next)
  // 初始化 i18next
  // 配置项: https://www.i18next.com/overview/configuration-options
  .init({
    debug: false,
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false, // React 已经能够防止 xss 攻击
    },
    resources: {
      zh: {
        translation: zh
      },
      en: {
        translation: en
      }
    }
  });

export default i18n;

