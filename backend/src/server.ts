import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import emailRoutes from './routes/email.routes';
import { runReconciliation } from './queue/reconciler';
import './queue/emailWorker'; // Import to start the worker
import { prisma } from './db/prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/emails', emailRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`Backend server running on port ${PORT}`);
  
  // Auto-seed database if empty (For Render Free Tier)
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log("Database is empty! Running auto-seed...");
    await prisma.user.create({
      data: {
        email: 'test@reachinbox.ai',
        name: 'Test User',
        senders: {
          create: {
            id: 'sender-uuid-placeholder',
            email: 'sender@reachinbox.ai',
            smtpUser: 'ethereal_user_placeholder',
            smtpPass: 'ethereal_pass_placeholder'
          }
        }
      }
    });
    console.log("Auto-seed complete!");
  }

  // Run startup reconciliation for jobs
  await runReconciliation();
});
