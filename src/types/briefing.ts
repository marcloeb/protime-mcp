// Briefing Types - matching mnl-front data model

export interface Briefing {
  id: string;
  userId: string;
  topic: string;
  description?: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  sources: Source[];
  categories: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

export interface Source {
  id: string;
  type: 'newsletter' | 'rss' | 'gmail';
  url: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface Edition {
  id: string;
  briefingId: string;
  generatedAt: Date;
  status: 'generating' | 'completed' | 'failed';
  summaryCount: number;
  tokenUsage: number;
}

export interface EditionContent {
  id: string;
  briefingId: string;
  edition: Edition;
  categories: CategorySummary[];
  rawContent?: string;
}

export interface CategorySummary {
  category: string;
  summaries: Summary[];
  count: number;
}

export interface Summary {
  id: string;
  title: string;
  content: string;
  source: Source;
  url?: string;
  publishedAt?: Date;
  tags: string[];
}

export interface BriefingConfig {
  briefingId: string;
  topic: string;
  description?: string;
  schedule: string;
  sources: Source[];
  categories: string[];
  active: boolean;
  stats: {
    totalEditions: number;
    lastEditionDate?: Date;
    totalSummaries: number;
  };
}

export interface CreateBriefingRequest {
  topic: string;
  description?: string;
}

export interface UpdateBriefingRequest {
  schedule?: 'daily' | 'weekly' | 'monthly';
  sources?: string[];  // URLs or source IDs
  categories?: string[];
  active?: boolean;
}
