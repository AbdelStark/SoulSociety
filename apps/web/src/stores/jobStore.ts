/**
 * Job state management using Zustand
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { JobStatus, JobOutput, StarkProof } from '@soul-society/sdk';

/**
 * Job entity for the store
 */
export interface Job {
  id: string;
  serviceId: string;
  status: JobStatus;
  timestamp: number;
  input: Record<string, unknown>;
  output?: JobOutput;
  proof?: StarkProof;
  progress?: number;
  error?: string;
}

/**
 * Job store state
 */
interface JobState {
  jobs: Map<string, Job>;
  activeJobId: string | null;

  // Actions
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  removeJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  clearJobs: () => void;

  // Selectors
  getJobsByStatus: (status: JobStatus) => Job[];
  getJobById: (id: string) => Job | undefined;
  getRecentJobs: (limit?: number) => Job[];
}

/**
 * Job store with Zustand
 */
export const useJobStore = create<JobState>()(
  subscribeWithSelector((set, get) => ({
    jobs: new Map(),
    activeJobId: null,

    addJob: (job) =>
      set((state) => {
        const newJobs = new Map(state.jobs);
        newJobs.set(job.id, job);
        return { jobs: newJobs };
      }),

    updateJob: (id, updates) =>
      set((state) => {
        const newJobs = new Map(state.jobs);
        const existing = newJobs.get(id);
        if (existing) {
          newJobs.set(id, { ...existing, ...updates });
        }
        return { jobs: newJobs };
      }),

    removeJob: (id) =>
      set((state) => {
        const newJobs = new Map(state.jobs);
        newJobs.delete(id);
        return {
          jobs: newJobs,
          activeJobId: state.activeJobId === id ? null : state.activeJobId,
        };
      }),

    setActiveJob: (id) => set({ activeJobId: id }),

    clearJobs: () => set({ jobs: new Map(), activeJobId: null }),

    getJobsByStatus: (status) => {
      return Array.from(get().jobs.values()).filter((j) => j.status === status);
    },

    getJobById: (id) => get().jobs.get(id),

    getRecentJobs: (limit = 10) => {
      return Array.from(get().jobs.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    },
  }))
);

/**
 * Hook to get all jobs as an array (sorted by timestamp)
 */
export function useJobs(): Job[] {
  return useJobStore((state) =>
    Array.from(state.jobs.values()).sort((a, b) => b.timestamp - a.timestamp)
  );
}

/**
 * Hook to get active job
 */
export function useActiveJob(): Job | undefined {
  return useJobStore((state) =>
    state.activeJobId ? state.jobs.get(state.activeJobId) : undefined
  );
}
