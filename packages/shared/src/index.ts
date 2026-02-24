export type StoryStatus = 'waiting' | 'in_progress' | 'completed';

export interface StoryCard {
  id: string;
  title: string;
  status: StoryStatus;
  priority: 'low' | 'med' | 'high' | 'urgent';
  blocked: boolean;
  points?: number;
  assignee?: string;
  updatedAt: string;
}
