/**
 * 环境变量配置读取和验证
 */

export interface AppConfig {
  VIEW_TOKEN: string;
  ADMIN_TOKEN: string;
  PORT: number;
  DATA_DIR: string;
}

/**
 * 读取并验证环境变量
 * 如果必填变量缺失，抛出错误
 */
export function loadConfig(): AppConfig {
  const VIEW_TOKEN = process.env.VIEW_TOKEN;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!VIEW_TOKEN) {
    throw new Error('环境变量 VIEW_TOKEN 未设置，服务无法启动');
  }

  if (!ADMIN_TOKEN) {
    throw new Error('环境变量 ADMIN_TOKEN 未设置，服务无法启动');
  }

  const PORT = parseInt(process.env.PORT || '8080', 10);
  const DATA_DIR = process.env.DATA_DIR || '/data';

  return {
    VIEW_TOKEN,
    ADMIN_TOKEN,
    PORT,
    DATA_DIR,
  };
}
