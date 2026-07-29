import { prisma } from '../src/db/prisma';
import { redisClient } from '../src/queue/emailQueue';
import { emailWorker } from '../src/queue/emailWorker';
import { sendEmail } from '../src/utils/mailer';

// Mock dependencies
jest.mock('../src/db/prisma', () => ({
  prisma: {
    emailJob: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../src/queue/emailQueue', () => ({
  redisClient: {
    incr: jest.fn(),
    expire: jest.fn(),
  },
  connection: {},
}));

jest.mock('../src/utils/mailer', () => ({
  sendEmail: jest.fn(),
}));

describe('Email Worker Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await emailWorker.close();
  });

  it('should skip job if already processed (Idempotency check)', async () => {
    // Mock updateMany to return 0 count (already processed or processing)
    (prisma.emailJob.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const jobMock = {
      data: { jobId: '1', campaignId: 'c1' },
      moveToDelayed: jest.fn(),
      token: 'token',
    } as any;

    await expect(emailWorker.processFn(jobMock)).resolves.toBeUndefined();

    // Verify it did not fetch job details or send email
    expect(prisma.emailJob.findUnique).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('should delay job if hourly limit is exceeded', async () => {
    (prisma.emailJob.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.emailJob.findUnique as jest.Mock).mockResolvedValueOnce({
      id: '1',
      recipientEmail: 'test@test.com',
      campaign: {
        subject: 'Test Subject',
        body: 'Test Body',
        hourlyLimit: 5,
        delayBetweenEmails: 0,
        sender: { id: 's1', email: 'sender@test.com' },
      },
    });

    // Mock redis incr to return count > limit
    (redisClient.incr as jest.Mock).mockResolvedValueOnce(6);

    const jobMock = {
      data: { jobId: '1', campaignId: 'c1' },
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
      token: 'token',
    } as any;

    // The worker is designed to throw an error to fail the attempt when manually delayed
    await expect(emailWorker.processFn(jobMock)).rejects.toThrow('DELAYED_HOURLY_LIMIT');

    // Verify job was set back to PENDING
    expect(prisma.emailJob.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { status: 'PENDING' },
    });

    // Verify job was moved to delayed
    expect(jobMock.moveToDelayed).toHaveBeenCalled();
    // Verify email was not sent
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
