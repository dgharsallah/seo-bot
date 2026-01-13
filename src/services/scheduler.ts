import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { GeneratedArticle, ContentGenerationOptions } from '../types';
import { ContentGenerator } from './content-generator';
import { AstroPublisher, AstroConfig } from './astro-publisher';

export interface ScheduledTask {
  id: string;
  type: 'generate' | 'publish' | 'generate_and_publish';
  status: 'pending' | 'running' | 'completed' | 'failed';
  scheduledAt: Date;
  executedAt?: Date;
  options: ContentGenerationOptions;
  article?: GeneratedArticle;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface SchedulerConfig {
  dataDir: string;              // Directory to store scheduler data
  astroConfig?: AstroConfig;    // Astro publishing config
  checkInterval?: number;       // How often to check for due tasks (ms)
  maxConcurrent?: number;       // Max concurrent tasks
  autoStart?: boolean;          // Start scheduler automatically
}

export class Scheduler extends EventEmitter {
  private config: SchedulerConfig;
  private tasks: Map<string, ScheduledTask> = new Map();
  private contentGenerator: ContentGenerator;
  private astroPublisher?: AstroPublisher;
  private intervalId?: NodeJS.Timeout;
  private running: boolean = false;
  private dataFile: string;

  constructor(config: SchedulerConfig) {
    super();
    this.config = {
      checkInterval: 60000, // 1 minute
      maxConcurrent: 2,
      autoStart: false,
      ...config,
    };

    this.dataFile = path.join(this.config.dataDir, 'scheduled-tasks.json');
    this.contentGenerator = new ContentGenerator();

    if (this.config.astroConfig) {
      this.astroPublisher = new AstroPublisher(this.config.astroConfig);
    }

    if (this.config.autoStart) {
      this.start();
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.dataDir, { recursive: true });
    await this.loadTasks();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.intervalId = setInterval(() => {
      this.processDueTasks();
    }, this.config.checkInterval);

    this.emit('started');
    console.log('Scheduler started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.emit('stopped');
    console.log('Scheduler stopped');
  }

  async schedule(
    options: ContentGenerationOptions,
    scheduledAt: Date,
    type: ScheduledTask['type'] = 'generate_and_publish'
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id: this.generateId(),
      type,
      status: 'pending',
      scheduledAt,
      options,
      retryCount: 0,
      maxRetries: 3,
    };

    this.tasks.set(task.id, task);
    await this.saveTasks();

    this.emit('scheduled', task);
    return task;
  }

  async scheduleBulk(
    items: Array<{
      options: ContentGenerationOptions;
      scheduledAt: Date;
      type?: ScheduledTask['type'];
    }>
  ): Promise<ScheduledTask[]> {
    const tasks: ScheduledTask[] = [];

    for (const item of items) {
      const task = await this.schedule(
        item.options,
        item.scheduledAt,
        item.type || 'generate_and_publish'
      );
      tasks.push(task);
    }

    return tasks;
  }

  async scheduleWeekly(
    keywords: string[],
    options: {
      startDate?: Date;
      postsPerWeek?: number;
      tone?: ContentGenerationOptions['tone'];
      includeFAQ?: boolean;
    } = {}
  ): Promise<ScheduledTask[]> {
    const startDate = options.startDate || new Date();
    const postsPerWeek = options.postsPerWeek || 3;
    const daysInterval = Math.floor(7 / postsPerWeek);

    const tasks: ScheduledTask[] = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < keywords.length; i++) {
      const task = await this.schedule(
        {
          targetKeyword: keywords[i],
          tone: options.tone || 'professional',
          includeFAQ: options.includeFAQ,
        },
        new Date(currentDate),
        'generate_and_publish'
      );

      tasks.push(task);
      currentDate.setDate(currentDate.getDate() + daysInterval);
    }

    return tasks;
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    this.tasks.delete(taskId);
    await this.saveTasks();

    this.emit('cancelled', taskId);
    return true;
  }

  async reschedule(taskId: string, newDate: Date): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    task.scheduledAt = newDate;
    await this.saveTasks();

    this.emit('rescheduled', task);
    return true;
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(filter?: {
    status?: ScheduledTask['status'];
    type?: ScheduledTask['type'];
    fromDate?: Date;
    toDate?: Date;
  }): ScheduledTask[] {
    let tasks = Array.from(this.tasks.values());

    if (filter?.status) {
      tasks = tasks.filter(t => t.status === filter.status);
    }
    if (filter?.type) {
      tasks = tasks.filter(t => t.type === filter.type);
    }
    if (filter?.fromDate) {
      tasks = tasks.filter(t => t.scheduledAt >= filter.fromDate!);
    }
    if (filter?.toDate) {
      tasks = tasks.filter(t => t.scheduledAt <= filter.toDate!);
    }

    return tasks.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  getPendingTasks(): ScheduledTask[] {
    return this.listTasks({ status: 'pending' });
  }

  getUpcomingTasks(days: number = 7): ScheduledTask[] {
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + days);

    return this.listTasks({
      status: 'pending',
      fromDate: new Date(),
      toDate,
    });
  }

  private async processDueTasks(): Promise<void> {
    const now = new Date();
    const dueTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'pending' && t.scheduledAt <= now)
      .slice(0, this.config.maxConcurrent);

    for (const task of dueTasks) {
      await this.executeTask(task);
    }
  }

  async executeTask(task: ScheduledTask): Promise<void> {
    if (task.status !== 'pending') return;

    task.status = 'running';
    this.emit('taskStarted', task);

    try {
      // Generate content
      if (task.type === 'generate' || task.type === 'generate_and_publish') {
        console.log(`Generating article for: ${task.options.targetKeyword}`);
        task.article = await this.contentGenerator.generateArticle(task.options);
      }

      // Publish to Astro
      if (
        (task.type === 'publish' || task.type === 'generate_and_publish') &&
        task.article &&
        this.astroPublisher
      ) {
        console.log(`Publishing article: ${task.article.title}`);
        const result = await this.astroPublisher.publish(task.article, {
          pubDate: task.scheduledAt,
        });

        if (!result.success) {
          throw new Error(result.error || 'Publishing failed');
        }
      }

      task.status = 'completed';
      task.executedAt = new Date();
      this.emit('taskCompleted', task);
      console.log(`Task completed: ${task.id}`);

    } catch (error: any) {
      task.retryCount++;

      if (task.retryCount < task.maxRetries) {
        task.status = 'pending';
        task.scheduledAt = new Date(Date.now() + 300000); // Retry in 5 minutes
        this.emit('taskRetry', task);
        console.log(`Task ${task.id} will retry in 5 minutes`);
      } else {
        task.status = 'failed';
        task.error = error.message;
        this.emit('taskFailed', task);
        console.error(`Task ${task.id} failed: ${error.message}`);
      }
    }

    await this.saveTasks();
  }

  async runNow(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    await this.executeTask(task);
    // Re-fetch to get updated status
    const updatedTask = this.tasks.get(taskId);
    return updatedTask?.status === 'completed';
  }

  private async loadTasks(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const parsed = JSON.parse(data);

      for (const task of parsed.tasks || []) {
        task.scheduledAt = new Date(task.scheduledAt);
        if (task.executedAt) {
          task.executedAt = new Date(task.executedAt);
        }
        if (task.article?.generatedAt) {
          task.article.generatedAt = new Date(task.article.generatedAt);
        }
        this.tasks.set(task.id, task);
      }

      console.log(`Loaded ${this.tasks.size} tasks from storage`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading tasks:', error.message);
      }
    }
  }

  private async saveTasks(): Promise<void> {
    const data = {
      tasks: Array.from(this.tasks.values()),
      savedAt: new Date().toISOString(),
    };

    await fs.writeFile(this.dataFile, JSON.stringify(data, null, 2));
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async clearCompleted(): Promise<number> {
    const completedIds = Array.from(this.tasks.entries())
      .filter(([_, t]) => t.status === 'completed' || t.status === 'failed')
      .map(([id]) => id);

    for (const id of completedIds) {
      this.tasks.delete(id);
    }

    await this.saveTasks();
    return completedIds.length;
  }

  getStats(): {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    running: number;
  } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      running: tasks.filter(t => t.status === 'running').length,
    };
  }
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  return new Scheduler(config);
}
