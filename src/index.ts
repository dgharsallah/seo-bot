export * from './types';
export * from './config';
export * from './services';

import { SiteAnalyzer } from './services/site-analyzer';
import { KeywordResearcher } from './services/keyword-research';
import { ContentGenerator } from './services/content-generator';
import { InternalLinker } from './services/internal-linker';
import { config, validateConfig } from './config';

export interface SEOBotOptions {
  openaiApiKey?: string;
  maxPagesToAnalyze?: number;
}

export class SEOBot {
  private siteAnalyzer: SiteAnalyzer;
  private keywordResearcher: KeywordResearcher;
  private contentGenerator: ContentGenerator;
  private internalLinker: InternalLinker;

  constructor(options: SEOBotOptions = {}) {
    if (options.openaiApiKey) {
      process.env.OPENAI_API_KEY = options.openaiApiKey;
    }

    const errors = validateConfig();
    if (errors.length > 0) {
      throw new Error(`Configuration errors: ${errors.join(', ')}`);
    }

    this.siteAnalyzer = new SiteAnalyzer(options.maxPagesToAnalyze || 20);
    this.keywordResearcher = new KeywordResearcher();
    this.contentGenerator = new ContentGenerator();
    this.internalLinker = new InternalLinker();
  }

  async analyzeSite(url: string) {
    return this.siteAnalyzer.analyze(url);
  }

  async researchKeywords(siteAnalysis: any, seedKeywords?: string[]) {
    return this.keywordResearcher.researchKeywords(siteAnalysis, seedKeywords);
  }

  async generateArticle(options: any) {
    return this.contentGenerator.generateArticle(options);
  }

  async suggestInternalLinks(article: any, existingPages: any[]) {
    return this.contentGenerator.suggestInternalLinks(article, existingPages);
  }

  async analyzeInternalLinking(pages: any[]) {
    return this.internalLinker.analyzeAndSuggestLinks(pages);
  }

  async findContentGaps(siteAnalysis: any) {
    return this.keywordResearcher.findContentGaps(siteAnalysis);
  }

  async runFullPipeline(url: string, options: { generateContent?: boolean } = {}) {
    console.log('Starting SEO analysis pipeline...');

    // Step 1: Analyze the site
    console.log('Step 1: Analyzing site...');
    const siteAnalysis = await this.analyzeSite(url);
    console.log(`  Found ${siteAnalysis.existingContent.length} pages`);
    console.log(`  Detected niche: ${siteAnalysis.niche}`);

    // Step 2: Research keywords
    console.log('Step 2: Researching keywords...');
    const keywordClusters = await this.researchKeywords(siteAnalysis);
    console.log(`  Generated ${keywordClusters.length} keyword clusters`);

    // Step 3: Find content gaps
    console.log('Step 3: Finding content gaps...');
    const contentGaps = await this.findContentGaps(siteAnalysis);
    console.log(`  Found ${contentGaps.length} content opportunities`);

    // Step 4: Analyze internal linking
    console.log('Step 4: Analyzing internal linking...');
    const linkOpportunities = await this.analyzeInternalLinking(siteAnalysis.existingContent);
    console.log(`  Found ${linkOpportunities.length} link opportunities`);

    // Step 5: Generate content (optional)
    let generatedArticles: any[] = [];
    if (options.generateContent && contentGaps.length > 0) {
      console.log('Step 5: Generating content...');
      const topTopic = contentGaps[0];
      const article = await this.generateArticle({
        targetKeyword: topTopic,
        tone: 'professional',
      });
      generatedArticles.push(article);
      console.log(`  Generated article: ${article.title}`);
    }

    return {
      siteAnalysis,
      keywordClusters,
      contentGaps,
      linkOpportunities,
      generatedArticles,
    };
  }
}

export default SEOBot;
