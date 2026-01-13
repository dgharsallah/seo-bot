#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { SEOBot } from './index';
import { config, validateConfig, getOutputPath } from './config';
import { GeneratedArticle, SiteAnalysis, KeywordCluster } from './types';
import { Scheduler, AstroPublisher } from './services';

const program = new Command();

program
  .name('seo-bot')
  .description('AI-powered SEO automation tool')
  .version('1.0.0');

// Analyze command
program
  .command('analyze <url>')
  .description('Analyze a website for SEO insights')
  .option('-o, --output <file>', 'Output file for results')
  .option('-p, --pages <number>', 'Max pages to analyze', '20')
  .action(async (url: string, options) => {
    const spinner = ora('Analyzing website...').start();

    try {
      const bot = new SEOBot({ maxPagesToAnalyze: parseInt(options.pages) });
      const analysis = await bot.analyzeSite(url);

      spinner.succeed('Analysis complete!');

      console.log('\n' + chalk.bold('Site Analysis Results'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.cyan('URL:')} ${analysis.url}`);
      console.log(`${chalk.cyan('Title:')} ${analysis.title}`);
      console.log(`${chalk.cyan('Niche:')} ${analysis.niche}`);
      console.log(`${chalk.cyan('Target Audience:')} ${analysis.targetAudience}`);
      console.log(`${chalk.cyan('Pages Found:')} ${analysis.existingContent.length}`);
      console.log(`${chalk.cyan('Main Topics:')}`);
      analysis.mainTopics.slice(0, 5).forEach(topic => {
        console.log(`  • ${topic}`);
      });

      if (options.output) {
        await saveOutput(options.output, analysis);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Keywords command
program
  .command('keywords <url>')
  .description('Research keywords for a website')
  .option('-s, --seed <keywords>', 'Comma-separated seed keywords')
  .option('-o, --output <file>', 'Output file for results')
  .action(async (url: string, options) => {
    const spinner = ora('Researching keywords...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Generating keyword clusters...';
      const seedKeywords = options.seed?.split(',').map((k: string) => k.trim());
      const clusters = await bot.researchKeywords(analysis, seedKeywords);

      spinner.succeed('Keyword research complete!');

      console.log('\n' + chalk.bold('Keyword Clusters'));
      console.log(chalk.gray('─'.repeat(50)));

      clusters.forEach((cluster: KeywordCluster, i: number) => {
        console.log(`\n${chalk.yellow(`Cluster ${i + 1}:`)} ${chalk.bold(cluster.mainKeyword)}`);
        console.log(chalk.cyan('Related keywords:'));
        cluster.relatedKeywords.slice(0, 5).forEach(kw => {
          console.log(`  • ${kw.keyword} (${kw.intent}, relevance: ${(kw.relevanceScore * 100).toFixed(0)}%)`);
        });
        if (cluster.suggestedTopics.length > 0) {
          console.log(chalk.cyan('Suggested topics:'));
          cluster.suggestedTopics.slice(0, 3).forEach(topic => {
            console.log(`  → ${topic}`);
          });
        }
      });

      if (options.output) {
        await saveOutput(options.output, clusters);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Keyword research failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate <keyword>')
  .description('Generate an SEO-optimized article')
  .option('-t, --tone <tone>', 'Article tone (professional, casual, technical, friendly)', 'professional')
  .option('-w, --words <number>', 'Target word count', '2000')
  .option('-s, --secondary <keywords>', 'Comma-separated secondary keywords')
  .option('-f, --faq', 'Include FAQ section')
  .option('-o, --output <file>', 'Output file for article')
  .option('-i, --instructions <text>', 'Custom instructions for content')
  .action(async (keyword: string, options) => {
    const spinner = ora('Generating article...').start();

    try {
      const bot = new SEOBot();

      const article = await bot.generateArticle({
        targetKeyword: keyword,
        secondaryKeywords: options.secondary?.split(',').map((k: string) => k.trim()),
        tone: options.tone,
        targetWordCount: parseInt(options.words),
        includeFAQ: options.faq,
        customInstructions: options.instructions,
      });

      spinner.succeed('Article generated!');

      console.log('\n' + chalk.bold('Generated Article'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.cyan('Title:')} ${article.title}`);
      console.log(`${chalk.cyan('Slug:')} ${article.slug}`);
      console.log(`${chalk.cyan('Word Count:')} ${article.wordCount}`);
      console.log(`${chalk.cyan('Reading Time:')} ${article.readingTime} min`);
      console.log(`${chalk.cyan('Meta Description:')} ${article.metaDescription}`);

      const outputFile = options.output || `${article.slug}.md`;
      await saveArticle(outputFile, article);
      console.log(`\n${chalk.green('✓')} Article saved to ${outputFile}`);

    } catch (error: any) {
      spinner.fail('Article generation failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Full pipeline command
program
  .command('run <url>')
  .description('Run the full SEO pipeline')
  .option('-g, --generate', 'Also generate content for top opportunity')
  .option('-o, --output <dir>', 'Output directory', './output')
  .action(async (url: string, options) => {
    const spinner = ora('Starting SEO pipeline...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Step 1/4: Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Step 2/4: Researching keywords...';
      const clusters = await bot.researchKeywords(analysis);

      spinner.text = 'Step 3/4: Finding content gaps...';
      const gaps = await bot.findContentGaps(analysis);

      spinner.text = 'Step 4/4: Analyzing internal links...';
      const linkOpps = await bot.analyzeInternalLinking(analysis.existingContent);

      spinner.succeed('Pipeline complete!');

      // Summary
      console.log('\n' + chalk.bold('SEO Pipeline Results'));
      console.log(chalk.gray('═'.repeat(50)));

      console.log(`\n${chalk.yellow('Site Analysis:')}`);
      console.log(`  Niche: ${analysis.niche}`);
      console.log(`  Pages analyzed: ${analysis.existingContent.length}`);

      console.log(`\n${chalk.yellow('Keywords:')}`);
      console.log(`  Clusters generated: ${clusters.length}`);
      const totalKeywords = clusters.reduce((sum: number, c: KeywordCluster) => sum + c.relatedKeywords.length, 0);
      console.log(`  Total keywords: ${totalKeywords}`);

      console.log(`\n${chalk.yellow('Content Opportunities:')}`);
      gaps.slice(0, 5).forEach((gap: string) => {
        console.log(`  → ${gap}`);
      });

      console.log(`\n${chalk.yellow('Internal Link Opportunities:')} ${linkOpps.length}`);

      // Save results
      await fs.mkdir(options.output, { recursive: true });

      await saveOutput(path.join(options.output, 'analysis.json'), analysis);
      await saveOutput(path.join(options.output, 'keywords.json'), clusters);
      await saveOutput(path.join(options.output, 'content-gaps.json'), gaps);
      await saveOutput(path.join(options.output, 'link-opportunities.json'), linkOpps);

      console.log(`\n${chalk.green('✓')} All results saved to ${options.output}/`);

      // Generate content if requested
      if (options.generate && gaps.length > 0) {
        console.log('\n' + chalk.bold('Generating content...'));
        const genSpinner = ora('Creating article...').start();

        const article = await bot.generateArticle({
          targetKeyword: gaps[0],
          tone: 'professional',
        });

        genSpinner.succeed(`Article generated: ${article.title}`);
        await saveArticle(path.join(options.output, `${article.slug}.md`), article);
      }

    } catch (error: any) {
      spinner.fail('Pipeline failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Gaps command
program
  .command('gaps <url>')
  .description('Find content gaps and opportunities')
  .option('-o, --output <file>', 'Output file for results')
  .action(async (url: string, options) => {
    const spinner = ora('Finding content gaps...').start();

    try {
      const bot = new SEOBot();

      spinner.text = 'Analyzing site...';
      const analysis = await bot.analyzeSite(url);

      spinner.text = 'Identifying gaps...';
      const gaps = await bot.findContentGaps(analysis);

      spinner.succeed('Content gap analysis complete!');

      console.log('\n' + chalk.bold('Content Opportunities'));
      console.log(chalk.gray('─'.repeat(50)));

      gaps.forEach((gap: string, i: number) => {
        console.log(`${chalk.yellow(`${i + 1}.`)} ${gap}`);
      });

      if (options.output) {
        await saveOutput(options.output, gaps);
        console.log(`\n${chalk.green('✓')} Results saved to ${options.output}`);
      }
    } catch (error: any) {
      spinner.fail('Gap analysis failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Schedule command
program
  .command('schedule <keyword>')
  .description('Schedule an article for generation and publishing')
  .option('-d, --date <date>', 'Publish date (ISO format or relative like "tomorrow", "+3days")')
  .option('-t, --tone <tone>', 'Article tone', 'professional')
  .option('--astro <path>', 'Astro content directory path')
  .option('--collection <name>', 'Astro collection name', 'blog')
  .option('--data-dir <path>', 'Scheduler data directory', './.seo-bot')
  .action(async (keyword: string, options) => {
    try {
      const scheduledDate = parseDate(options.date || 'tomorrow');

      const scheduler = new Scheduler({
        dataDir: options.dataDir,
        astroConfig: options.astro ? {
          contentDir: options.astro,
          collection: options.collection,
        } : undefined,
      });

      await scheduler.initialize();

      const task = await scheduler.schedule(
        {
          targetKeyword: keyword,
          tone: options.tone,
        },
        scheduledDate,
        options.astro ? 'generate_and_publish' : 'generate'
      );

      console.log(chalk.green('✓') + ' Article scheduled!');
      console.log(`${chalk.cyan('Task ID:')} ${task.id}`);
      console.log(`${chalk.cyan('Keyword:')} ${keyword}`);
      console.log(`${chalk.cyan('Scheduled:')} ${scheduledDate.toLocaleString()}`);
      console.log(`${chalk.cyan('Type:')} ${task.type}`);

      if (options.astro) {
        console.log(`${chalk.cyan('Publish to:')} ${options.astro}/${options.collection}/`);
      }

    } catch (error: any) {
      console.error(chalk.red('Scheduling failed:'), error.message);
      process.exit(1);
    }
  });

// Schedule bulk command
program
  .command('schedule-bulk')
  .description('Schedule multiple articles from a file or keyword list')
  .option('-k, --keywords <keywords>', 'Comma-separated keywords')
  .option('-f, --file <path>', 'File with keywords (one per line)')
  .option('--start <date>', 'Start date', 'tomorrow')
  .option('--interval <days>', 'Days between posts', '2')
  .option('--astro <path>', 'Astro content directory path')
  .option('--collection <name>', 'Astro collection name', 'blog')
  .option('--data-dir <path>', 'Scheduler data directory', './.seo-bot')
  .action(async (options) => {
    try {
      let keywords: string[] = [];

      if (options.file) {
        const content = await fs.readFile(options.file, 'utf-8');
        keywords = content.split('\n').map(k => k.trim()).filter(Boolean);
      } else if (options.keywords) {
        keywords = options.keywords.split(',').map((k: string) => k.trim());
      } else {
        console.error(chalk.red('Provide --keywords or --file'));
        process.exit(1);
      }

      const scheduler = new Scheduler({
        dataDir: options.dataDir,
        astroConfig: options.astro ? {
          contentDir: options.astro,
          collection: options.collection,
        } : undefined,
      });

      await scheduler.initialize();

      const startDate = parseDate(options.start);
      const intervalDays = parseInt(options.interval);

      const tasks = await scheduler.scheduleWeekly(keywords, {
        startDate,
        postsPerWeek: Math.ceil(7 / intervalDays),
      });

      console.log(chalk.green('✓') + ` Scheduled ${tasks.length} articles!`);
      console.log('\n' + chalk.bold('Schedule:'));

      tasks.forEach((task, i) => {
        console.log(`  ${chalk.yellow(i + 1 + '.')} ${task.options.targetKeyword}`);
        console.log(`     ${chalk.gray(task.scheduledAt.toLocaleString())}`);
      });

    } catch (error: any) {
      console.error(chalk.red('Bulk scheduling failed:'), error.message);
      process.exit(1);
    }
  });

// List scheduled tasks
program
  .command('schedule-list')
  .description('List all scheduled tasks')
  .option('--status <status>', 'Filter by status (pending, completed, failed)')
  .option('--data-dir <path>', 'Scheduler data directory', './.seo-bot')
  .action(async (options) => {
    try {
      const scheduler = new Scheduler({ dataDir: options.dataDir });
      await scheduler.initialize();

      const tasks = scheduler.listTasks(
        options.status ? { status: options.status } : undefined
      );

      if (tasks.length === 0) {
        console.log(chalk.yellow('No scheduled tasks found.'));
        return;
      }

      console.log(chalk.bold(`Scheduled Tasks (${tasks.length})`));
      console.log(chalk.gray('─'.repeat(60)));

      for (const task of tasks) {
        const statusColor = {
          pending: chalk.yellow,
          running: chalk.blue,
          completed: chalk.green,
          failed: chalk.red,
        }[task.status];

        console.log(`\n${chalk.cyan('ID:')} ${task.id}`);
        console.log(`${chalk.cyan('Keyword:')} ${task.options.targetKeyword}`);
        console.log(`${chalk.cyan('Status:')} ${statusColor(task.status)}`);
        console.log(`${chalk.cyan('Scheduled:')} ${task.scheduledAt.toLocaleString()}`);
        if (task.executedAt) {
          console.log(`${chalk.cyan('Executed:')} ${task.executedAt.toLocaleString()}`);
        }
        if (task.error) {
          console.log(`${chalk.cyan('Error:')} ${chalk.red(task.error)}`);
        }
      }

      // Stats
      const stats = scheduler.getStats();
      console.log('\n' + chalk.gray('─'.repeat(60)));
      console.log(
        `${chalk.bold('Stats:')} ` +
        `${chalk.yellow(stats.pending + ' pending')} | ` +
        `${chalk.green(stats.completed + ' completed')} | ` +
        `${chalk.red(stats.failed + ' failed')}`
      );

    } catch (error: any) {
      console.error(chalk.red('Failed to list tasks:'), error.message);
      process.exit(1);
    }
  });

// Run scheduler daemon
program
  .command('schedule-run')
  .description('Run the scheduler to process due tasks')
  .option('--once', 'Process due tasks once and exit')
  .option('--astro <path>', 'Astro content directory path')
  .option('--collection <name>', 'Astro collection name', 'blog')
  .option('--data-dir <path>', 'Scheduler data directory', './.seo-bot')
  .action(async (options) => {
    try {
      const scheduler = new Scheduler({
        dataDir: options.dataDir,
        astroConfig: options.astro ? {
          contentDir: options.astro,
          collection: options.collection,
        } : undefined,
        checkInterval: 60000,
      });

      await scheduler.initialize();

      scheduler.on('taskStarted', (task) => {
        console.log(chalk.blue('▶') + ` Starting: ${task.options.targetKeyword}`);
      });

      scheduler.on('taskCompleted', (task) => {
        console.log(chalk.green('✓') + ` Completed: ${task.options.targetKeyword}`);
        if (task.article) {
          console.log(`  Title: ${task.article.title}`);
        }
      });

      scheduler.on('taskFailed', (task) => {
        console.log(chalk.red('✗') + ` Failed: ${task.options.targetKeyword}`);
        console.log(`  Error: ${task.error}`);
      });

      if (options.once) {
        const pending = scheduler.getPendingTasks();
        const due = pending.filter(t => t.scheduledAt <= new Date());

        if (due.length === 0) {
          console.log(chalk.yellow('No tasks due for execution.'));
          return;
        }

        console.log(`Processing ${due.length} due task(s)...`);
        for (const task of due) {
          await scheduler.runNow(task.id);
        }
        console.log(chalk.green('Done!'));
      } else {
        console.log(chalk.bold('Scheduler running...'));
        console.log(chalk.gray('Press Ctrl+C to stop\n'));

        const stats = scheduler.getStats();
        console.log(`Pending tasks: ${stats.pending}`);

        scheduler.start();

        // Keep process alive
        process.on('SIGINT', () => {
          console.log('\nStopping scheduler...');
          scheduler.stop();
          process.exit(0);
        });
      }

    } catch (error: any) {
      console.error(chalk.red('Scheduler failed:'), error.message);
      process.exit(1);
    }
  });

// Publish to Astro command
program
  .command('publish <file>')
  .description('Publish a markdown article to Astro')
  .requiredOption('--astro <path>', 'Astro content directory path')
  .option('--collection <name>', 'Astro collection name', 'blog')
  .option('--draft', 'Publish as draft')
  .option('--date <date>', 'Publish date')
  .action(async (file: string, options) => {
    const spinner = ora('Publishing to Astro...').start();

    try {
      // Read the markdown file
      const content = await fs.readFile(file, 'utf-8');

      // Parse frontmatter and content
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!fmMatch) {
        throw new Error('Invalid markdown file format (missing frontmatter)');
      }

      const frontmatter = parseFrontmatter(fmMatch[1]);
      const articleContent = fmMatch[2].trim();

      const article: GeneratedArticle = {
        title: frontmatter.title || path.basename(file, '.md'),
        slug: frontmatter.slug || path.basename(file, '.md'),
        metaDescription: frontmatter.description || '',
        content: articleContent,
        targetKeyword: frontmatter.keywords?.[0] || '',
        secondaryKeywords: frontmatter.keywords?.slice(1) || [],
        wordCount: articleContent.split(/\s+/).length,
        readingTime: Math.ceil(articleContent.split(/\s+/).length / 200),
        generatedAt: new Date(),
        suggestedInternalLinks: [],
      };

      const publisher = new AstroPublisher({
        contentDir: options.astro,
        collection: options.collection,
      });

      const result = await publisher.publish(article, {
        pubDate: options.date ? parseDate(options.date) : new Date(),
        draft: options.draft,
      });

      if (result.success) {
        spinner.succeed('Published to Astro!');
        console.log(`${chalk.cyan('File:')} ${result.filePath}`);
        console.log(`${chalk.cyan('Slug:')} ${result.slug}`);
      } else {
        throw new Error(result.error);
      }

    } catch (error: any) {
      spinner.fail('Publishing failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Helper function to parse dates
function parseDate(input: string): Date {
  const now = new Date();

  if (input === 'now') return now;
  if (input === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  // Handle +Ndays format
  const daysMatch = input.match(/^\+(\d+)days?$/i);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(daysMatch[1]));
    d.setHours(9, 0, 0, 0);
    return d;
  }

  // Try parsing as ISO date
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Invalid date format: ${input}`);
}

// Helper function to parse frontmatter
function parseFrontmatter(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};

  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      let value: any = match[2].trim();

      // Handle quoted strings
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      // Handle arrays
      if (value.startsWith('[')) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch {}
      }

      result[match[1]] = value;
    }
  }

  return result;
}

// Helper functions
async function saveOutput(filepath: string, data: any) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
}

async function saveArticle(filepath: string, article: GeneratedArticle) {
  const dir = path.dirname(filepath);
  await fs.mkdir(dir, { recursive: true });

  const frontMatter = `---
title: "${article.title}"
slug: "${article.slug}"
description: "${article.metaDescription}"
keywords: ["${article.targetKeyword}", ${article.secondaryKeywords.map(k => `"${k}"`).join(', ')}]
wordCount: ${article.wordCount}
readingTime: ${article.readingTime}
generatedAt: "${article.generatedAt.toISOString()}"
---

`;

  await fs.writeFile(filepath, frontMatter + article.content);
}

// Helper to validate config before command execution
function requireConfig() {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error(chalk.red('Configuration errors:'));
    errors.forEach(e => console.error(`  • ${e}`));
    console.error(chalk.yellow('\nCreate a .env file with your API keys. See .env.example'));
    process.exit(1);
  }
}

// Add hook to validate config before command execution
program.hook('preAction', () => {
  requireConfig();
});

program.parse();
