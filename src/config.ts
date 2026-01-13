import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface Config {
  openaiApiKey: string;
  anthropicApiKey?: string;
  dataForSeoLogin?: string;
  dataForSeoPassword?: string;
  defaultLanguage: string;
  maxArticleWords: number;
  includeImages: boolean;
  outputDir: string;
  outputFormat: 'markdown' | 'html' | 'json';
  // Astro integration
  astroContentDir?: string;
  astroCollection?: string;
  // Scheduler
  schedulerDataDir: string;
  defaultAuthor?: string;
}

export const config: Config = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  dataForSeoLogin: process.env.DATAFORSEO_LOGIN,
  dataForSeoPassword: process.env.DATAFORSEO_PASSWORD,
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  maxArticleWords: parseInt(process.env.MAX_ARTICLE_WORDS || '2500', 10),
  includeImages: process.env.INCLUDE_IMAGES !== 'false',
  outputDir: process.env.OUTPUT_DIR || './output',
  outputFormat: (process.env.OUTPUT_FORMAT as Config['outputFormat']) || 'markdown',
  // Astro integration
  astroContentDir: process.env.ASTRO_CONTENT_DIR,
  astroCollection: process.env.ASTRO_COLLECTION || 'blog',
  // Scheduler
  schedulerDataDir: process.env.SCHEDULER_DATA_DIR || './.seo-bot',
  defaultAuthor: process.env.DEFAULT_AUTHOR || 'SEO Bot',
};

export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.openaiApiKey && !config.anthropicApiKey) {
    errors.push('Either OPENAI_API_KEY or ANTHROPIC_API_KEY is required');
  }

  return errors;
}

export function getOutputPath(filename: string): string {
  return path.join(config.outputDir, filename);
}
