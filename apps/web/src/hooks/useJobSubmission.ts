/**
 * Hook for submitting jobs to the DVM network
 */

import { useState, useCallback } from 'react';
import { submitJob, subscribeToResults, ServiceType, type JobInput } from '../lib/nostr';
import { useJobStore, type Job } from '../stores';
import { JobStatus } from '@soul-society/sdk';

/**
 * Submission state
 */
interface SubmissionState {
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Hook return type
 */
interface UseJobSubmissionReturn extends SubmissionState {
  submit: (serviceType: ServiceType, input: JobInput, bidMsats?: number) => Promise<string | null>;
  reset: () => void;
}

/**
 * Map service type to service ID for UI
 */
function getServiceId(serviceType: ServiceType): string {
  switch (serviceType) {
    case ServiceType.Fibonacci:
      return 's1';
    case ServiceType.HashVerify:
      return 's2';
    case ServiceType.MerkleProof:
      return 's3';
  }
}

/**
 * Hook for job submission
 */
export function useJobSubmission(): UseJobSubmissionReturn {
  const [state, setState] = useState<SubmissionState>({
    isSubmitting: false,
    error: null,
  });

  const { addJob, updateJob } = useJobStore();

  const submit = useCallback(
    async (
      serviceType: ServiceType,
      input: JobInput,
      bidMsats: number = 0
    ): Promise<string | null> => {
      setState({ isSubmitting: true, error: null });

      try {
        // Submit job to network
        const requestId = await submitJob(serviceType, input, bidMsats);

        // Create job in store
        const job: Job = {
          id: requestId,
          serviceId: getServiceId(serviceType),
          status: JobStatus.Pending,
          timestamp: Date.now(),
          input: input as unknown as Record<string, unknown>,
          progress: 0,
        };
        addJob(job);

        // Subscribe to results
        const unsubscribe = subscribeToResults(requestId, serviceType, (result) => {
          if (result.status === 'success') {
            updateJob(requestId, {
              status: JobStatus.Verified,
              output: result.result,
              proof: result.proof,
              progress: 100,
            });
          } else {
            updateJob(requestId, {
              status: JobStatus.Failed,
              error: result.error || 'Unknown error',
            });
          }
          unsubscribe();
        });

        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          const currentJob = useJobStore.getState().jobs.get(requestId);
          if (currentJob && currentJob.status === JobStatus.Pending) {
            updateJob(requestId, {
              status: JobStatus.Processing,
              progress: Math.min((currentJob.progress || 0) + 10, 90),
            });
          } else {
            clearInterval(progressInterval);
          }
        }, 1000);

        setState({ isSubmitting: false, error: null });
        return requestId;
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Failed to submit job';
        setState({ isSubmitting: false, error });
        return null;
      }
    },
    [addJob, updateJob]
  );

  const reset = useCallback(() => {
    setState({ isSubmitting: false, error: null });
  }, []);

  return {
    ...state,
    submit,
    reset,
  };
}
