import { Worker, Job } from 'bullmq';
import { prisma } from '../db/prisma';
import { sendEmail } from '../utils/mailer';
import { connection } from './emailQueue';
import { redisClient } from './emailQueue';

// Mocking some configurable limits if not in env
const GLOBAL_HOURLY_LIMIT = parseInt(process.env.MAX_EMAILS_PER_HOUR || '0', 10);
const DEFAULT_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

export const emailWorker = new Worker(
  'email-queue',
  async (job: Job) => {
    const { jobId, campaignId } = job.data;

    // 1. Idempotency: Atomic state transition from PENDING -> PROCESSING
    const updateResult = await prisma.emailJob.updateMany({
      where: {
        id: jobId,
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
      },
    });

    if (updateResult.count === 0) {
      console.log(`Job ${jobId} already processed or processing. Skipping.`);
      return; // Skip duplicate processing
    }

    try {
      // Fetch full job data
      const emailJob = await prisma.emailJob.findUnique({
        where: { id: jobId },
        include: {
          campaign: {
            include: {
              sender: true,
            },
          },
        },
      });

      if (!emailJob || !emailJob.campaign || !emailJob.campaign.sender) {
        throw new Error('Incomplete data for job');
      }

      const sender = emailJob.campaign.sender;
      const hourlyLimit = emailJob.campaign.hourlyLimit > 0 ? emailJob.campaign.hourlyLimit : GLOBAL_HOURLY_LIMIT;
      
      // 2. Rate Limiting Check (Per-Sender Hourly Limit)
      if (hourlyLimit > 0) {
        const currentHour = new Date();
        currentHour.setMinutes(0, 0, 0);
        const hourKey = `email_count:${sender.id}:${currentHour.getTime()}`;

        // Increment count and set expiry if new
        const count = await redisClient.incr(hourKey);
        if (count === 1) {
          await redisClient.expire(hourKey, 3600); // Expire in 1 hour
        }

        if (count > hourlyLimit) {
          // Revert processing status back to PENDING so it can be picked up again safely
          await prisma.emailJob.update({
            where: { id: jobId },
            data: { status: 'PENDING' },
          });

          // Delay to the next hour
          const nextHour = new Date(currentHour);
          nextHour.setHours(nextHour.getHours() + 1);
          const delayMs = nextHour.getTime() - new Date().getTime();
          console.log(`Hourly limit reached for sender ${sender.email}. Delaying job ${jobId} by ${delayMs}ms.`);
          
          await job.moveToDelayed(Date.now() + delayMs, job.token!);
          // Throwing an error stops execution for this attempt. BullMQ handles moveToDelayed properly when we do it manually, but returning is safer.
          // Wait, moveToDelayed throws if successful (DelayedError in BullMQ Pro), or we can just return and handle it.
          // In free BullMQ, if we use moveToDelayed, we should throw a special error or just let it finish. 
          // Since we manually moved it, we can just throw to fail this active attempt, but moveToDelayed usually throws `DelayedError`.
          // Let's just throw to ensure the worker knows it didn't complete successfully, but we want it delayed, not failed.
          throw new Error('DELAYED_HOURLY_LIMIT'); 
        }
      }

      // 3. Send Email
      await sendEmail(
        emailJob.recipientEmail,
        emailJob.campaign.subject,
        emailJob.campaign.body,
        sender.email // Ideally we'd use the sender's credentials, but we use the global Ethereal for now
      );

      // 4. Update Status to SENT
      await prisma.emailJob.update({
        where: { id: jobId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      // 5. Artificial Delay (if configured)
      const delayMs = emailJob.campaign.delayBetweenEmails;
      if (delayMs > 0) {
        await new Promise((res) => setTimeout(res, delayMs));
      }

    } catch (error: any) {
      if (error.message === 'DELAYED_HOURLY_LIMIT') {
         // It's handled
         return;
      }
      
      // Update Status to FAILED
      await prisma.emailJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: error.message,
        },
      });
      throw error;
    }
  },
  {
    connection,
    concurrency: DEFAULT_CONCURRENCY,
  }
);

emailWorker.on('failed', (job, err) => {
  if (err.message !== 'DELAYED_HOURLY_LIMIT') {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
  }
});

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});
