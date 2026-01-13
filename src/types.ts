export interface SiteAnalysis {
  url: string;
  title: string;
  description: string;
  niche: string;
  mainTopics: string[];
  existingContent: PageInfo[];
  competitors: string[];
  targetAudience: string;
  language: string;
  analyzedAt: Date;
}

export interface PageInfo {
  url: string;
  title: string;
  headings: string[];
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
}

export interface Keyword {
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  cpc?: number;
  intent: 'informational' | 'navigational' | 'transactional' | 'commercial';
  relevanceScore: number;
  suggestedBy: 'analysis' | 'competitor' | 'related' | 'manual';
}

export interface KeywordCluster {
  mainKeyword: string;
  relatedKeywords: Keyword[];
  suggestedTopics: string[];
}

export interface ContentPlan {
  id: string;
  title: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  outline: ContentOutline;
  estimatedWordCount: number;
  priority: 'high' | 'medium' | 'low';
  status: 'planned' | 'in_progress' | 'draft' | 'published';
}

export interface ContentOutline {
  introduction: string;
  sections: OutlineSection[];
  conclusion: string;
}

export interface OutlineSection {
  heading: string;
  subheadings: string[];
  keyPoints: string[];
}

export interface GeneratedArticle {
  title: string;
  slug: string;
  metaDescription: string;
  content: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  wordCount: number;
  readingTime: number;
  generatedAt: Date;
  suggestedInternalLinks: InternalLink[];
}

export interface InternalLink {
  anchorText: string;
  targetUrl: string;
  context: string;
}

export interface ContentGenerationOptions {
  targetKeyword: string;
  secondaryKeywords?: string[];
  tone?: 'professional' | 'casual' | 'technical' | 'friendly';
  targetWordCount?: number;
  includeImages?: boolean;
  includeFAQ?: boolean;
  language?: string;
  customInstructions?: string;
}
