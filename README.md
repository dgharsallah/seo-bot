# SEO Bot

An AI-powered SEO automation tool for content generation, keyword research, and site optimization.

## Features

- **Site Analysis** - Crawl and analyze any website to understand its niche, content, and structure
- **Keyword Research** - AI-powered keyword clustering and opportunity discovery
- **Content Generation** - Generate SEO-optimized articles with proper structure
- **Internal Linking** - Analyze and suggest internal link opportunities
- **Content Gap Analysis** - Identify missing content opportunities

## Quick Start

### Installation

```bash
# Clone and install
cd seo-bot
npm install

# Configure
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### Configuration

Create a `.env` file with your API keys:

```env
OPENAI_API_KEY=sk-your-openai-api-key
```

### Usage

#### Analyze a Website

```bash
npm run dev -- analyze https://example.com
```

#### Research Keywords

```bash
npm run dev -- keywords https://example.com
npm run dev -- keywords https://example.com --seed "seo tools,content marketing"
```

#### Generate an Article

```bash
npm run dev -- generate "how to improve SEO"
npm run dev -- generate "best practices for content marketing" --tone casual --words 3000 --faq
```

#### Find Content Gaps

```bash
npm run dev -- gaps https://example.com
```

#### Run Full Pipeline

```bash
npm run dev -- run https://example.com
npm run dev -- run https://example.com --generate  # Also generate article for top opportunity
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `analyze <url>` | Analyze a website for SEO insights |
| `keywords <url>` | Research keywords for a website |
| `generate <keyword>` | Generate an SEO-optimized article |
| `gaps <url>` | Find content gaps and opportunities |
| `run <url>` | Run the full SEO pipeline |

### Options

#### analyze
- `-p, --pages <number>` - Max pages to analyze (default: 20)
- `-o, --output <file>` - Save results to file

#### keywords
- `-s, --seed <keywords>` - Comma-separated seed keywords
- `-o, --output <file>` - Save results to file

#### generate
- `-t, --tone <tone>` - Article tone: professional, casual, technical, friendly
- `-w, --words <number>` - Target word count (default: 2000)
- `-s, --secondary <keywords>` - Comma-separated secondary keywords
- `-f, --faq` - Include FAQ section
- `-i, --instructions <text>` - Custom instructions
- `-o, --output <file>` - Output file for article

#### run
- `-g, --generate` - Also generate content for top opportunity
- `-o, --output <dir>` - Output directory (default: ./output)

## Programmatic Usage

```typescript
import { SEOBot } from './src';

const bot = new SEOBot({
  openaiApiKey: 'sk-...',
  maxPagesToAnalyze: 30,
});

// Analyze a site
const analysis = await bot.analyzeSite('https://example.com');
console.log(analysis.niche, analysis.mainTopics);

// Research keywords
const clusters = await bot.researchKeywords(analysis);

// Generate content
const article = await bot.generateArticle({
  targetKeyword: 'best seo practices',
  tone: 'professional',
  targetWordCount: 2500,
  includeFAQ: true,
});

// Run full pipeline
const results = await bot.runFullPipeline('https://example.com', {
  generateContent: true,
});
```

## Project Structure

```
seo-bot/
├── src/
│   ├── cli.ts              # CLI interface
│   ├── index.ts            # Main entry point
│   ├── config.ts           # Configuration
│   ├── types.ts            # TypeScript types
│   └── services/
│       ├── site-analyzer.ts    # Website crawling & analysis
│       ├── keyword-research.ts # Keyword research & clustering
│       ├── content-generator.ts # AI content generation
│       └── internal-linker.ts   # Internal link analysis
├── output/                 # Generated content output
├── .env.example           # Environment template
├── package.json
└── tsconfig.json
```

## Development

```bash
# Build
npm run build

# Run in development
npm run dev -- <command>

# Run built version
npm start -- <command>
```

## Extending

### Adding New CMS Integrations

Create a new file in `src/services/cms/`:

```typescript
export interface CMSPublisher {
  publish(article: GeneratedArticle): Promise<string>;
  update(id: string, article: GeneratedArticle): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### Custom Content Templates

Modify `content-generator.ts` prompts or create template files for different content types.

## API Costs

This tool uses OpenAI's API. Estimated costs per operation:
- Site analysis: ~$0.01-0.05
- Keyword research: ~$0.02-0.05 per cluster
- Article generation: ~$0.10-0.30 per article

## License

MIT
