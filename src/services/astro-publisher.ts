import fs from 'fs/promises';
import path from 'path';
import { GeneratedArticle } from '../types';

export interface AstroConfig {
  contentDir: string;        // Path to Astro content directory (e.g., ./src/content/blog)
  collection: string;        // Collection name (e.g., 'blog', 'posts')
  imageDir?: string;         // Path for images (e.g., ./public/images/blog)
  baseUrl?: string;          // Base URL for the site
  defaultAuthor?: string;    // Default author name
  defaultCategory?: string;  // Default category
}

export interface AstroFrontmatter {
  title: string;
  description: string;
  pubDate: Date;
  updatedDate?: Date;
  author?: string;
  category?: string;
  tags?: string[];
  image?: {
    url: string;
    alt: string;
  };
  draft?: boolean;
  [key: string]: any;
}

export interface PublishResult {
  success: boolean;
  filePath?: string;
  slug?: string;
  error?: string;
}

export class AstroPublisher {
  private config: AstroConfig;

  constructor(config: AstroConfig) {
    this.config = {
      defaultAuthor: 'SEO Bot',
      defaultCategory: 'general',
      ...config,
      collection: config.collection || 'blog',
    };
  }

  async publish(
    article: GeneratedArticle,
    options: {
      pubDate?: Date;
      draft?: boolean;
      author?: string;
      category?: string;
      tags?: string[];
      customFrontmatter?: Record<string, any>;
    } = {}
  ): Promise<PublishResult> {
    try {
      const contentPath = path.join(this.config.contentDir, this.config.collection);

      // Ensure directory exists
      await fs.mkdir(contentPath, { recursive: true });

      const frontmatter = this.buildFrontmatter(article, options);
      const fileContent = this.formatContent(frontmatter, article.content);

      const filename = `${article.slug}.md`;
      const filePath = path.join(contentPath, filename);

      await fs.writeFile(filePath, fileContent, 'utf-8');

      return {
        success: true,
        filePath,
        slug: article.slug,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async publishMultiple(
    articles: GeneratedArticle[],
    options: {
      intervalDays?: number;  // Days between each post
      startDate?: Date;
      draft?: boolean;
    } = {}
  ): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    const startDate = options.startDate || new Date();
    const intervalDays = options.intervalDays || 1;

    for (let i = 0; i < articles.length; i++) {
      const pubDate = new Date(startDate);
      pubDate.setDate(pubDate.getDate() + (i * intervalDays));

      const result = await this.publish(articles[i], {
        pubDate,
        draft: options.draft,
      });

      results.push(result);
    }

    return results;
  }

  async unpublish(slug: string): Promise<boolean> {
    try {
      const filePath = path.join(
        this.config.contentDir,
        this.config.collection,
        `${slug}.md`
      );

      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async setDraft(slug: string, isDraft: boolean): Promise<boolean> {
    try {
      const filePath = path.join(
        this.config.contentDir,
        this.config.collection,
        `${slug}.md`
      );

      const content = await fs.readFile(filePath, 'utf-8');
      const updatedContent = this.updateFrontmatterField(content, 'draft', isDraft);

      await fs.writeFile(filePath, updatedContent, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  async listPublished(): Promise<string[]> {
    try {
      const contentPath = path.join(this.config.contentDir, this.config.collection);
      const files = await fs.readdir(contentPath);

      return files
        .filter(f => f.endsWith('.md') || f.endsWith('.mdx'))
        .map(f => f.replace(/\.(md|mdx)$/, ''));
    } catch {
      return [];
    }
  }

  private buildFrontmatter(
    article: GeneratedArticle,
    options: {
      pubDate?: Date;
      draft?: boolean;
      author?: string;
      category?: string;
      tags?: string[];
      customFrontmatter?: Record<string, any>;
    }
  ): AstroFrontmatter {
    const tags = options.tags || [
      article.targetKeyword,
      ...article.secondaryKeywords.slice(0, 4),
    ];

    return {
      title: article.title,
      description: article.metaDescription,
      pubDate: options.pubDate || new Date(),
      author: options.author || this.config.defaultAuthor,
      category: options.category || this.config.defaultCategory,
      tags,
      draft: options.draft ?? false,
      readingTime: article.readingTime,
      wordCount: article.wordCount,
      seo: {
        keyword: article.targetKeyword,
        secondaryKeywords: article.secondaryKeywords,
      },
      ...options.customFrontmatter,
    };
  }

  private formatContent(frontmatter: AstroFrontmatter, content: string): string {
    const yaml = this.toYaml(frontmatter);
    return `---\n${yaml}---\n\n${content}`;
  }

  private toYaml(obj: Record<string, any>, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;

      if (value instanceof Date) {
        yaml += `${spaces}${key}: ${value.toISOString()}\n`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  -\n${this.toYaml(item, indent + 2)}`;
          } else {
            yaml += `${spaces}  - "${String(item).replace(/"/g, '\\"')}"\n`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${spaces}${key}:\n${this.toYaml(value, indent + 1)}`;
      } else if (typeof value === 'string') {
        // Escape quotes and handle multiline
        const escaped = value.replace(/"/g, '\\"');
        yaml += `${spaces}${key}: "${escaped}"\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }

    return yaml;
  }

  private updateFrontmatterField(
    content: string,
    field: string,
    value: any
  ): string {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) return content;

    let frontmatter = match[1];
    const fieldRegex = new RegExp(`^${field}:.*$`, 'm');

    if (fieldRegex.test(frontmatter)) {
      frontmatter = frontmatter.replace(fieldRegex, `${field}: ${value}`);
    } else {
      frontmatter += `\n${field}: ${value}`;
    }

    return content.replace(frontmatterRegex, `---\n${frontmatter}\n---`);
  }

  getContentPath(): string {
    return path.join(this.config.contentDir, this.config.collection);
  }
}

export function createAstroPublisher(config: AstroConfig): AstroPublisher {
  return new AstroPublisher(config);
}
