import { prisma } from '../db/prisma';
import { emailQueue } from './emailQueue';

export const runReconciliation = async () => {
  console.log('Running startup reconciliation for Email Jobs...');
  
  try {
    const pendingJobs = await prisma.emailJob.findMany({
      where: {
        status: 'PENDING',
      },
    });

    if (pendingJobs.length === 0) {
      console.log('No pending jobs found for reconciliation.');
      return;
    }

    console.log(`Found ${pendingJobs.length} pending jobs in DB. Checking Redis...`);

    // BullMQ limits fetching all jobs if there are too many, but for typical loads this is fine.
    const delayedJobs = await emailQueue.getDelayed();
    const waitingJobs = await emailQueue.getWaiting();
    const activeJobs = await emailQueue.getActive();

    const queuedJobIds = new Set(
      [...delayedJobs, ...waitingJobs, ...activeJobs].map((j) => j.id)
    );

    let reEnqueuedCount = 0;

    for (const job of pendingJobs) {
      if (!queuedJobIds.has(job.id)) {
        // Job is in DB as PENDING but not in Redis queue. Re-enqueue it.
        const now = new Date().getTime();
        const scheduledTime = job.scheduledAt.getTime();
        const delay = Math.max(0, scheduledTime - now);

        await emailQueue.add(
          'send-email',
          { jobId: job.id, campaignId: job.campaignId },
          {
            jobId: job.id, // Using DB id as BullMQ job ID prevents double-enqueuing natively if job somehow exists
            delay,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
        reEnqueuedCount++;
      }
    }

    console.log(`Reconciliation complete. Re-enqueued ${reEnqueuedCount} jobs.`);
  } catch (error) {
    console.error('Error during reconciliation:', error);
  }
};
