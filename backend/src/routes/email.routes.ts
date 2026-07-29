import { Router } from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import { prisma } from '../db/prisma';
import { emailQueue } from '../queue/emailQueue';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.post('/schedule', upload.single('csv'), async (req, res) => {
  try {
    const { subject, body, startTime, delayBetweenEmails, hourlyLimit, senderId } = req.body;
    const file = req.file;

    if (!file || !subject || !body || !startTime || !senderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const startDateTime = new Date(startTime);
    const delayMs = parseInt(delayBetweenEmails || '0', 10);
    const limit = parseInt(hourlyLimit || '0', 10);

    // Parse CSV
    const emails: string[] = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(csvParser())
        .on('data', (data) => {
          // Extract email from CSV row
          const email = data.email || Object.values(data)[0];
          if (email) emails.push(email.trim());
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (emails.length === 0) {
      return res.status(400).json({ error: 'No valid emails found in CSV' });
    }

    // 1. Create Campaign
    // TODO: Replace with actual auth session user ID once backend auth is implemented
    const user = await prisma.user.findFirst();
    if (!user) {
        return res.status(500).json({ error: 'No user found in DB. Please create one.' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        senderId,
        subject,
        body,
        startTime: startDateTime,
        delayBetweenEmails: delayMs,
        hourlyLimit: limit,
      },
    });

    // 2. Create Jobs
    const jobs = emails.map((email, index) => {
      // Calculate precise scheduled time for each email to avoid blocking workers unnecessarily
      const jobScheduledTime = new Date(startDateTime.getTime() + index * delayMs);
      return {
        campaignId: campaign.id,
        recipientEmail: email,
        scheduledAt: jobScheduledTime,
        status: 'PENDING' as const,
      };
    });

    await prisma.emailJob.createMany({ data: jobs });

    const createdJobs = await prisma.emailJob.findMany({
      where: { campaignId: campaign.id },
    });

    // 3. Enqueue Jobs in BullMQ
    for (const job of createdJobs) {
      const now = new Date().getTime();
      const delay = Math.max(0, job.scheduledAt.getTime() - now);

      await emailQueue.add(
        'send-email',
        { jobId: job.id, campaignId: campaign.id },
        {
          jobId: job.id, // Prevent double enqueue
          delay,
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
    }

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({ message: 'Campaign scheduled successfully', campaignId: campaign.id, emailsScheduled: jobs.length });
  } catch (error) {
    console.error('Error scheduling campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/scheduled', async (req, res) => {
  try {
    const jobs = await prisma.emailJob.findMany({
      where: { status: 'PENDING' },
      include: { campaign: { select: { subject: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching scheduled jobs' });
  }
});

router.get('/sent', async (req, res) => {
  try {
    const jobs = await prisma.emailJob.findMany({
      where: { status: { in: ['SENT', 'FAILED'] } },
      include: { campaign: { select: { subject: true } } },
      orderBy: { sentAt: 'desc' },
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching sent jobs' });
  }
});

export default router;
